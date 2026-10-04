package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.audit.PayoutEvent;
import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.audit.PayoutEventType;
import dev.yycodes.paymentsimulator.ledger.LedgerPostingService;
import dev.yycodes.paymentsimulator.provider.ProviderResult;
import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import dev.yycodes.paymentsimulator.reconciliation.*;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import dev.yycodes.paymentsimulator.shared.NotFoundException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Every payout state change. Each one runs in a single transaction with its audit event, and
 * confirming a payout also posts its journal, so the status, the audit trail and the ledger commit
 * together or not at all.
 */
@Service
public class PayoutStateService {

    private final PayoutRepository payouts;
    private final PayoutEventRepository events;
    private final ReconciliationAttemptRepository reconciliationAttempts;
    private final LedgerPostingService ledger;

    public PayoutStateService(
            PayoutRepository payouts,
            PayoutEventRepository events,
            ReconciliationAttemptRepository reconciliationAttempts,
            LedgerPostingService ledger) {
        this.payouts = payouts;
        this.events = events;
        this.reconciliationAttempts = reconciliationAttempts;
        this.ledger = ledger;
    }

    @Transactional
    public Payout markProcessing(UUID id) {
        Payout payout = require(id);
        PayoutStatus from = payout.getStatus();
        payout.startProcessing();
        payouts.saveAndFlush(payout);
        events.save(
                new PayoutEvent(id, PayoutEventType.PROCESSING_STARTED, from, payout.getStatus()));
        return payout;
    }

    @Transactional
    public Payout markProviderSucceeded(UUID id, String providerReference) {
        return transitionSucceeded(id, providerReference, PayoutEventType.PROVIDER_SUCCEEDED);
    }

    @Transactional
    public Payout markProviderFailed(UUID id, String providerReference) {
        return transitionFailed(id, providerReference, PayoutEventType.PROVIDER_DECLINED);
    }

    @Transactional
    public Payout markProviderRejected(UUID id) {
        return transitionFailed(id, null, PayoutEventType.PROVIDER_REJECTED);
    }

    @Transactional
    public Payout markProviderUncertain(
            UUID id, String providerReference, PayoutEventType eventType) {
        Payout payout = require(id);
        PayoutStatus from = payout.getStatus();
        payout.markUnknown(providerReference);
        payouts.saveAndFlush(payout);
        events.save(new PayoutEvent(id, eventType, from, payout.getStatus()));
        return payout;
    }

    @Transactional
    public Payout markUnknownAfterTimeout(UUID id) {
        return markProviderUncertain(id, null, PayoutEventType.PROVIDER_TIMEOUT);
    }

    @Transactional
    public Payout markRetrySucceeded(UUID id, String providerReference) {
        return transitionSucceeded(id, providerReference, PayoutEventType.PROVIDER_RETRY_SUCCEEDED);
    }

    @Transactional
    public Payout markRetryFailed(UUID id, String providerReference) {
        return transitionFailed(id, providerReference, PayoutEventType.PROVIDER_RETRY_DECLINED);
    }

    @Transactional
    public Payout markRetryUncertain(UUID id, String providerReference, PayoutEventType eventType) {
        Payout payout = requireUnknown(id);
        payout.markUnknown(providerReference);
        payouts.saveAndFlush(payout);
        events.save(new PayoutEvent(id, eventType, PayoutStatus.UNKNOWN, PayoutStatus.UNKNOWN));
        return payout;
    }

    @Transactional
    public Payout recordRetryTimeout(UUID id) {
        return markRetryUncertain(id, null, PayoutEventType.PROVIDER_RETRY_TIMEOUT);
    }

    @Transactional
    public Payout recordRetryRejected(UUID id) {
        Payout payout = requireUnknown(id);
        events.save(
                new PayoutEvent(
                        id,
                        PayoutEventType.PROVIDER_RETRY_REJECTED,
                        PayoutStatus.UNKNOWN,
                        PayoutStatus.UNKNOWN));
        return payout;
    }

    @Transactional
    public ReconciliationResolution recordUnresolvedReconciliation(
            UUID id, ProviderResult providerResult) {
        Payout payout = requireUnknownOrProcessing(id);
        PayoutStatus from = payout.getStatus();

        payout.markUnknown(providerResult == null ? null : providerResult.providerReference());
        payouts.saveAndFlush(payout);

        if (from == PayoutStatus.PROCESSING) {
            events.save(
                    new PayoutEvent(
                            id,
                            PayoutEventType.RECONCILIATION_UNRESOLVED,
                            from,
                            PayoutStatus.UNKNOWN));
        }

        ProviderStatus providerStatus = providerResult == null ? null : providerResult.status();

        ReconciliationOutcome outcome = ReconciliationOutcome.STILL_UNKNOWN;
        reconciliationAttempts.save(
                new ReconciliationAttempt(id, providerResult != null, providerStatus, outcome));
        return new ReconciliationResolution(payout, outcome);
    }

    @Transactional
    public ReconciliationResolution resolveReconciliation(UUID id, ProviderResult providerResult) {
        if (providerResult.status() == ProviderStatus.UNKNOWN
                || providerResult.status() == ProviderStatus.PENDING) {
            return recordUnresolvedReconciliation(id, providerResult);
        }

        Payout payout = requireUnknownOrProcessing(id);
        PayoutStatus from = payout.getStatus();

        ReconciliationOutcome outcome;
        PayoutEventType eventType;

        if (providerResult.status() == ProviderStatus.SUCCEEDED) {
            payout.markSucceeded(providerResult.providerReference());
            ledger.recordPayoutConfirmation(payout);
            outcome = ReconciliationOutcome.RESOLVED_SUCCEEDED;
            eventType = PayoutEventType.RECONCILIATION_SUCCEEDED;
        } else {
            payout.markFailed(providerResult.providerReference());
            outcome = ReconciliationOutcome.RESOLVED_FAILED;
            eventType = PayoutEventType.RECONCILIATION_FAILED;
        }

        payouts.saveAndFlush(payout);
        events.save(new PayoutEvent(id, eventType, from, payout.getStatus()));
        reconciliationAttempts.save(
                new ReconciliationAttempt(id, true, providerResult.status(), outcome));

        return new ReconciliationResolution(payout, outcome);
    }

    @Transactional(readOnly = true)
    public Payout get(UUID id) {
        return require(id);
    }

    private Payout transitionSucceeded(
            UUID id, String providerReference, PayoutEventType eventType) {
        Payout payout = requireUnknownOrProcessing(id);
        PayoutStatus from = payout.getStatus();
        payout.markSucceeded(providerReference);
        ledger.recordPayoutConfirmation(payout);
        payouts.saveAndFlush(payout);
        events.save(new PayoutEvent(id, eventType, from, payout.getStatus()));
        return payout;
    }

    private Payout transitionFailed(UUID id, String providerReference, PayoutEventType eventType) {
        Payout payout = requireUnknownOrProcessing(id);
        PayoutStatus from = payout.getStatus();
        payout.markFailed(providerReference);
        payouts.saveAndFlush(payout);
        events.save(new PayoutEvent(id, eventType, from, payout.getStatus()));
        return payout;
    }

    private Payout requireUnknownOrProcessing(UUID id) {
        Payout payout = require(id);
        if (payout.getStatus() != PayoutStatus.UNKNOWN
                && payout.getStatus() != PayoutStatus.PROCESSING) {
            throw new ConflictException(
                    "Payout "
                            + id
                            + " must be PROCESSING or UNKNOWN, but was "
                            + payout.getStatus());
        }
        return payout;
    }

    private Payout requireUnknown(UUID id) {
        Payout payout = require(id);
        if (payout.getStatus() != PayoutStatus.UNKNOWN) {
            throw new ConflictException("Only UNKNOWN payouts can be retried or reconciled");
        }
        return payout;
    }

    private Payout require(UUID id) {
        return payouts.findById(id)
                .orElseThrow(() -> new NotFoundException("Payout " + id + " was not found"));
    }
}
