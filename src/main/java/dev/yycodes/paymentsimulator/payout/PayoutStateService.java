package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.audit.PayoutEvent;
import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.audit.PayoutEventType;
import dev.yycodes.paymentsimulator.provider.ProviderResult;
import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import dev.yycodes.paymentsimulator.reconciliation.*;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import dev.yycodes.paymentsimulator.shared.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class PayoutStateService {

    private final PayoutRepository payouts;
    private final PayoutEventRepository events;
    private final ReconciliationAttemptRepository reconciliationAttempts;

    public PayoutStateService(
            PayoutRepository payouts,
            PayoutEventRepository events,
            ReconciliationAttemptRepository reconciliationAttempts) {
        this.payouts = payouts;
        this.events = events;
        this.reconciliationAttempts = reconciliationAttempts;
    }

    @Transactional
    public Payout markProcessing(UUID id) {
        Payout payout = require(id);
        PayoutStatus from = payout.getStatus();
        payout.startProcessing();
        payouts.saveAndFlush(payout);
        events.save(new PayoutEvent(id, PayoutEventType.PROCESSING_STARTED, from, payout.getStatus()));
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
    public Payout markUnknownAfterTimeout(UUID id) {
        Payout payout = require(id);
        PayoutStatus from = payout.getStatus();
        payout.markUnknown();
        payouts.saveAndFlush(payout);
        events.save(new PayoutEvent(id, PayoutEventType.PROVIDER_TIMEOUT, from, payout.getStatus()));
        return payout;
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
    public Payout recordRetryTimeout(UUID id) {
        Payout payout = requireUnknown(id);
        events.save(new PayoutEvent(
                id,
                PayoutEventType.PROVIDER_RETRY_TIMEOUT,
                PayoutStatus.UNKNOWN,
                PayoutStatus.UNKNOWN
        ));
        return payout;
    }

    @Transactional
    public ReconciliationResolution recordUnresolvedReconciliation(UUID id) {
        Payout payout = requireUnknown(id);
        ReconciliationOutcome outcome = ReconciliationOutcome.STILL_UNKNOWN;
        reconciliationAttempts.save(new ReconciliationAttempt(id, false, null, outcome));
        return new ReconciliationResolution(payout, outcome);
    }

    @Transactional
    public ReconciliationResolution resolveReconciliation(UUID id, ProviderResult providerResult) {
        Payout payout = requireUnknown(id);
        PayoutStatus from = payout.getStatus();

        ReconciliationOutcome outcome;
        PayoutEventType eventType;

        if (providerResult.status() == ProviderStatus.SUCCEEDED) {
            payout.markSucceeded(providerResult.providerReference());
            outcome = ReconciliationOutcome.RESOLVED_SUCCEEDED;
            eventType = PayoutEventType.RECONCILIATION_SUCCEEDED;
        } else {
            payout.markFailed(providerResult.providerReference());
            outcome = ReconciliationOutcome.RESOLVED_FAILED;
            eventType = PayoutEventType.RECONCILIATION_FAILED;
        }

        payouts.saveAndFlush(payout);
        events.save(new PayoutEvent(id, eventType, from, payout.getStatus()));
        reconciliationAttempts.save(new ReconciliationAttempt(
                id, true, providerResult.status(), outcome));

        return new ReconciliationResolution(payout, outcome);
    }

    @Transactional(readOnly = true)
    public Payout get(UUID id) {
        return require(id);
    }

    private Payout transitionSucceeded(UUID id, String providerReference, PayoutEventType eventType) {
        Payout payout = requireUnknownOrProcessing(id);
        PayoutStatus from = payout.getStatus();
        payout.markSucceeded(providerReference);
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
        if (payout.getStatus() != PayoutStatus.UNKNOWN && payout.getStatus() != PayoutStatus.PROCESSING) {
            throw new ConflictException(
                    "Payout " + id + " must be PROCESSING or UNKNOWN, but was " + payout.getStatus());
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
