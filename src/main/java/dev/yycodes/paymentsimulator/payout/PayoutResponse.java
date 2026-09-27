package dev.yycodes.paymentsimulator.payout;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record PayoutResponse(
        UUID id,
        String recipientReference,
        BigDecimal amount,
        String currency,
        PayoutStatus status,
        String providerReference,
        Instant createdAt,
        Instant updatedAt,
        String provider) {
    public static PayoutResponse from(Payout p) {
        return new PayoutResponse(
                p.getId(),
                p.getRecipientReference(),
                p.getAmount(),
                p.getCurrency(),
                p.getStatus(),
                p.getProviderReference(),
                p.getCreatedAt(),
                p.getUpdatedAt(),
                p.getProvider());
    }
}
