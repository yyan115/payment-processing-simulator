package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.observability.PaymentMetrics;
import dev.yycodes.paymentsimulator.provider.*;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationResolution;
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

    public Payout process(UUID id, SimulatedOutcome outcome) {
        Payout payout = states.markProcessing(id);
        log.info("payout_processing_started payoutId={}", id);

        try {
            ProviderResult result = provider.submit(
                    payout.getId(),
                    payout.getAmount(),
                    payout.getCurrency(),
                    outcome
            );

            metrics.providerResult(result.status());

            if (result.status() == ProviderStatus.SUCCEEDED) {
                log.info("payout_provider_succeeded payoutId={} providerReference={}",
                        id, result.providerReference());
                return states.markProviderSucceeded(id, result.providerReference());
            }

            log.info("payout_provider_declined payoutId={} providerReference={}",
                    id, result.providerReference());
            return states.markProviderFailed(id, result.providerReference());
        } catch (ProviderTimeoutException timeout) {
            metrics.unknownOutcome();
            log.warn("payout_provider_timeout payoutId={} outcome=unknown", id);
            return states.markUnknownAfterTimeout(id);
        }
    }

    public ReconciliationResolution reconcile(UUID id) {
        Payout payout = states.get(id);
        if (payout.getStatus() != PayoutStatus.UNKNOWN) {
            throw new dev.yycodes.paymentsimulator.shared.ConflictException(
                    "Only UNKNOWN payouts require reconciliation");
        }

        ReconciliationResolution resolution = provider.findByClientReference(id)
                .map(result -> states.resolveReconciliation(id, result))
                .orElseGet(() -> states.recordUnresolvedReconciliation(id));

        metrics.reconciliation(resolution.outcome());
        log.info("payout_reconciled payoutId={} outcome={}", id, resolution.outcome());
        return resolution;
    }
}
