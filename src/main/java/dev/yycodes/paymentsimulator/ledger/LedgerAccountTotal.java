package dev.yycodes.paymentsimulator.ledger;

import java.math.BigDecimal;

public record LedgerAccountTotal(
        String accountCode, String currency, BigDecimal debits, BigDecimal credits, long entries) {}
