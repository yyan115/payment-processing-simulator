package dev.yycodes.paymentsimulator.observability;

import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationOutcome;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.Map;

@Component
public class PaymentMetrics {

    private final Map<ProviderStatus, Counter> providerResults = new EnumMap<>(ProviderStatus.class);
    private final Map<ReconciliationOutcome, Counter> reconciliationResults =
            new EnumMap<>(ReconciliationOutcome.class);
    private final Counter unknownOutcomes;

    public PaymentMetrics(MeterRegistry registry) {
        for (ProviderStatus status : ProviderStatus.values()) {
            providerResults.put(status, Counter.builder("payments.payout.provider_results")
                    .tag("result", status.name().toLowerCase())
                    .register(registry));
        }

        for (ReconciliationOutcome outcome : ReconciliationOutcome.values()) {
            reconciliationResults.put(outcome, Counter.builder("payments.payout.reconciliation")
                    .tag("outcome", outcome.name().toLowerCase())
                    .register(registry));
        }

        unknownOutcomes = Counter.builder("payments.payout.unknown_outcomes").register(registry);
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
