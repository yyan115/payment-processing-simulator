package dev.yycodes.paymentsimulator.provider;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

@Service
public class SimulatedPaymentProvider implements PaymentProvider {

    private final SimulatedProviderStore store;
    private final SimulationScenarioRegistry scenarios;

    public SimulatedPaymentProvider(
            SimulatedProviderStore store, SimulationScenarioRegistry scenarios) {
        this.store = store;
        this.scenarios = scenarios;
    }

    @Override
    public ProviderResult submit(
            UUID clientReference, BigDecimal amount, String currency, SubmissionMode mode) {

        if (mode == SubmissionMode.RETRY) {
            Optional<ProviderResult> existing = store.find(clientReference);
            if (existing.isPresent()) {
                return existing.get();
            }
        }

        SimulatedOutcome outcome = scenarios.consume(clientReference);

        if (outcome == SimulatedOutcome.TIMEOUT_BEFORE_PROCESSING) {
            throw new ProviderTimeoutException(
                    "Provider did not return a response before processing began");
        }

        ProviderStatus status =
                switch (outcome) {
                    case DECLINED -> ProviderStatus.DECLINED;
                    case UNKNOWN -> ProviderStatus.UNKNOWN;
                    case PENDING -> ProviderStatus.PENDING;
                    default -> ProviderStatus.SUCCEEDED;
                };

        ProviderResult result = store.record(clientReference, amount, currency, status);

        if (outcome == SimulatedOutcome.TIMEOUT_AFTER_SUCCESS) {
            throw new ProviderTimeoutException(
                    "Provider completed payout "
                            + result.providerReference()
                            + " but the response was lost");
        }

        return result;
    }

    @Override
    public Optional<ProviderResult> findByClientReference(UUID clientReference) {
        return store.find(clientReference);
    }
}
