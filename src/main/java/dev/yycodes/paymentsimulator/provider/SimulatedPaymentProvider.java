package dev.yycodes.paymentsimulator.provider;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

@Service
public class SimulatedPaymentProvider implements PaymentProvider {

    private final SimulatedProviderStore store;

    public SimulatedPaymentProvider(SimulatedProviderStore store) {
        this.store = store;
    }

    @Override
    public ProviderResult submit(UUID clientReference, BigDecimal amount, String currency, SimulatedOutcome outcome) {
        if (outcome == SimulatedOutcome.TIMEOUT_BEFORE_PROCESSING) {
            throw new ProviderTimeoutException("Provider did not return a response before processing began");
        }

        ProviderStatus status = outcome == SimulatedOutcome.DECLINED
                ? ProviderStatus.DECLINED
                : ProviderStatus.SUCCEEDED;

        ProviderResult result = store.record(clientReference, amount, currency, status);

        if (outcome == SimulatedOutcome.TIMEOUT_AFTER_SUCCESS) {
            throw new ProviderTimeoutException(
                    "Provider completed payout " + result.providerReference() + " but the response was lost");
        }

        return result;
    }

    @Override
    public Optional<ProviderResult> findByClientReference(UUID clientReference) {
        return store.find(clientReference);
    }
}
