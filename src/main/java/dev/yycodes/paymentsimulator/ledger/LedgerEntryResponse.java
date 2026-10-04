package dev.yycodes.paymentsimulator.ledger;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record LedgerEntryResponse(
        UUID id,
        String accountCode,
        LedgerDirection direction,
        BigDecimal amount,
        String currency,
        Instant createdAt) {
    public static LedgerEntryResponse from(LedgerEntry entry) {
        return new LedgerEntryResponse(
                entry.getId(),
                entry.getAccountCode(),
                entry.getDirection(),
                entry.getAmount(),
                entry.getCurrency(),
                entry.getCreatedAt());
    }
}
