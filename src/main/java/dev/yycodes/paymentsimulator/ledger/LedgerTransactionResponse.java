package dev.yycodes.paymentsimulator.ledger;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record LedgerTransactionResponse(
        UUID id,
        UUID payoutId,
        LedgerTransactionType transactionType,
        BigDecimal amount,
        String currency,
        Instant createdAt,
        List<LedgerEntryResponse> entries
) {
}
