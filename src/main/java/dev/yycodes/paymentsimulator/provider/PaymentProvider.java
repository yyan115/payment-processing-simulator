package dev.yycodes.paymentsimulator.provider;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

public interface PaymentProvider {
    ProviderResult submit(
            UUID clientReference,
            BigDecimal amount,
            String currency,
            SubmissionMode mode
    );

    Optional<ProviderResult> findByClientReference(UUID clientReference);
}
