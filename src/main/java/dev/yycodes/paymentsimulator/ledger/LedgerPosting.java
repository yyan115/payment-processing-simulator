package dev.yycodes.paymentsimulator.ledger;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// One line of the ledger: a single debit or credit, with the payment that caused it.
public record LedgerPosting(
        UUID id,
        UUID payoutId,
        String accountCode,
        LedgerDirection direction,
        BigDecimal amount,
        String currency,
        Instant createdAt) {}
