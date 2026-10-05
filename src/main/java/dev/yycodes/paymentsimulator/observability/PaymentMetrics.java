package dev.yycodes.paymentsimulator.observability;

import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.payout.PayoutStatus;
import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationOutcome;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Prometheus metrics for the payment flow, covering network results, reconciliation outcomes and
 * payouts stuck in UNKNOWN or PROCESSING.
 */
@Component
public class PaymentMetrics {

    private final Map<ProviderStatus, Counter> providerResults =
            new EnumMap<>(ProviderStatus.class);

    private final Map<ReconciliationOutcome, Counter> reconciliationResults =
            new EnumMap<>(ReconciliationOutcome.class);

    private final Counter unknownOutcomes;

    public PaymentMetrics(
            MeterRegistry registry,
            PayoutRepository payouts,
            @Value("${payments.reconciliation.processing-stale-ms:60000}") long processingStaleMs) {

        for (ProviderStatus status : ProviderStatus.values()) {
            providerResults.put(
                    status,
                    Counter.builder("payments.payout.provider.results")
                            .tag("result", status.name().toLowerCase(Locale.ROOT))
                            .register(registry));
        }

        for (ReconciliationOutcome outcome : ReconciliationOutcome.values()) {
            reconciliationResults.put(
                    outcome,
                    Counter.builder("payments.payout.reconciliation")
                            .tag("outcome", outcome.name().toLowerCase(Locale.ROOT))
                            .register(registry));
        }

        unknownOutcomes = Counter.builder("payments.payout.unknown.outcomes").register(registry);

        Gauge.builder(
                        "payments.payout.unknown.current",
                        payouts,
                        repository -> repository.countByStatus(PayoutStatus.UNKNOWN))
                .description("Current number of payouts with an ambiguous external outcome")
                .register(registry);

        Gauge.builder(
                        "payments.payout.processing.stale.current",
                        payouts,
                        repository ->
                                repository.countByStatusAndUpdatedAtBefore(
                                        PayoutStatus.PROCESSING,
                                        Instant.now().minusMillis(processingStaleMs)))
                .description("Current number of PROCESSING payouts older than the recovery cutoff")
                .register(registry);
    }

    public void providerResult(ProviderStatus status) {
        providerResults.get(status).increment();
    }

    public void unknownOutcome() {
        unknownOutcomes.increment();
    }

    public void reconciliation(ReconciliationOutcome outcome) {
        reconciliationResults.get(outcome).increment();
    }
}
