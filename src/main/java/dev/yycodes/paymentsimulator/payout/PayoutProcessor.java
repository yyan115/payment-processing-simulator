package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.audit.PayoutEventType;
import dev.yycodes.paymentsimulator.observability.PaymentMetrics;
import dev.yycodes.paymentsimulator.provider.*;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationResolution;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class PayoutProcessor {

    private static final Logger log = LoggerFactory.getLogger(PayoutProcessor.class);

    private final PayoutStateService states;
    private final PaymentProvider provider;
    private final PaymentMetrics metrics;

    public PayoutProcessor(PayoutStateService states, PaymentProvider provider, PaymentMetrics metrics) {
        this.states = states;
        this.provider = provider;
        this.metrics = metrics;
    }

    public Payout process(UUID id) {
        Payout payout = states.markProcessing(id);
        log.info("payout_processing_started payoutId={}", id);

        try {
            ProviderResult result = provider.submit(
                    payout.getId(),
                    payout.getAmount(),
                    payout.getCurrency(),
                    SubmissionMode.ORIGINAL
            );

            metrics.providerResult(result.status());
            return finishOriginal(id, result);
        } catch (ProviderTimeoutException timeout) {
            metrics.unknownOutcome();
            log.warn("payout_provider_timeout payoutId={} outcome=unknown", id);
            return states.markUnknownAfterTimeout(id);
        } catch (ProviderRejectedException rejected) {
            log.warn("payout_provider_rejected payoutId={} statusCode={}",
                    id, rejected.getStatusCode());
            return states.markProviderRejected(id);
        }
    }

    public Payout retry(UUID id) {
        Payout payout = states.get(id);
        if (payout.getStatus() != PayoutStatus.UNKNOWN) {
            throw new ConflictException("Only UNKNOWN payouts can be retried");
        }

        log.info("payout_retry_started payoutId={}", id);

        try {
            ProviderResult result = provider.submit(
                    payout.getId(),
                    payout.getAmount(),
                    payout.getCurrency(),
                    SubmissionMode.RETRY
            );

            metrics.providerResult(result.status());
            return finishRetry(id, result);
        } catch (ProviderTimeoutException timeout) {
            metrics.unknownOutcome();
            log.warn("payout_retry_timeout payoutId={} outcome=unknown", id);
            return states.recordRetryTimeout(id);
        } catch (ProviderRejectedException rejected) {
            log.warn("payout_retry_rejected payoutId={} statusCode={} outcome=still_unknown",
                    id, rejected.getStatusCode());
            return states.recordRetryRejected(id);
        }
    }

    public ReconciliationResolution reconcile(UUID id) {
        Payout payout = states.get(id);
        if (payout.getStatus() != PayoutStatus.UNKNOWN) {
            throw new ConflictException("Only UNKNOWN payouts require reconciliation");
        }

        ReconciliationResolution resolution = provider.findByClientReference(id)
                .map(result -> states.resolveReconciliation(id, result))
                .orElseGet(() -> states.recordUnresolvedReconciliation(id, null));

        metrics.reconciliation(resolution.outcome());
        log.info("payout_reconciled payoutId={} outcome={}", id, resolution.outcome());
        return resolution;
    }

    private Payout finishOriginal(UUID id, ProviderResult result) {
        return switch (result.status()) {
            case SUCCEEDED -> {
                log.info("payout_provider_succeeded payoutId={} providerReference={}",
                        id, result.providerReference());
                yield states.markProviderSucceeded(id, result.providerReference());
            }
            case DECLINED -> {
                log.info("payout_provider_declined payoutId={} providerReference={}",
                        id, result.providerReference());
                yield states.markProviderFailed(id, result.providerReference());
            }
            case UNKNOWN -> {
                metrics.unknownOutcome();
                yield states.markProviderUncertain(
                        id, result.providerReference(), PayoutEventType.PROVIDER_UNKNOWN);
            }
            case PENDING -> {
                yield states.markProviderUncertain(
                        id, result.providerReference(), PayoutEventType.PROVIDER_PENDING);
            }
        };
    }

    private Payout finishRetry(UUID id, ProviderResult result) {
        return switch (result.status()) {
            case SUCCEEDED -> states.markRetrySucceeded(id, result.providerReference());
            case DECLINED -> states.markRetryFailed(id, result.providerReference());
            case UNKNOWN -> {
                metrics.unknownOutcome();
                yield states.markRetryUncertain(
                        id, result.providerReference(), PayoutEventType.PROVIDER_RETRY_UNKNOWN);
            }
            case PENDING -> states.markRetryUncertain(
                    id, result.providerReference(), PayoutEventType.PROVIDER_RETRY_PENDING);
        };
    }
}
