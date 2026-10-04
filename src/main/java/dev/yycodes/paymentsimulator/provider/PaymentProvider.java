package dev.yycodes.paymentsimulator.provider;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

/**
 * A payment network the platform can pay through. This code calls a network adapter a provider. A
 * payout is identified to the network by its own ID, so sending it again or looking it up never
 * creates a second payment.
 */
public interface PaymentProvider {
    ProviderResult submit(
            UUID clientReference, BigDecimal amount, String currency, SubmissionMode mode);

    Optional<ProviderResult> findByClientReference(UUID clientReference);
}
