package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.provider.*;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service
public class PayoutProcessor {
    private final PayoutStateService states;
    private final PaymentProvider provider;

    public PayoutProcessor(PayoutStateService states, PaymentProvider provider) {
        this.states = states;
        this.provider = provider;
    }

    public Payout process(UUID id, SimulatedOutcome outcome) {
        Payout payout = states.markProcessing(id);
        try {
            ProviderResult result = provider.submit(payout.getId(), payout.getAmount(), payout.getCurrency(), outcome);
            return result.status() == ProviderStatus.SUCCEEDED
                    ? states.markSucceeded(id, result.providerReference())
                    : states.markFailed(id, result.providerReference());
        } catch (ProviderTimeoutException timeout) {
            return states.markUnknown(id);
        }
    }

    public Payout reconcile(UUID id) {
        Payout payout = states.get(id);
        if (payout.getStatus() != PayoutStatus.UNKNOWN) {
            throw new ConflictException("Only UNKNOWN payouts require reconciliation");
        }

        return provider.findByClientReference(id)
                .map(result -> result.status() == ProviderStatus.SUCCEEDED
                        ? states.markSucceeded(id, result.providerReference())
                        : states.markFailed(id, result.providerReference()))
                .orElse(payout);
    }
}
