package dev.yycodes.paymentsimulator.reconciliation;

import dev.yycodes.paymentsimulator.payout.Payout;

public record ReconciliationResolution(Payout payout, ReconciliationOutcome outcome) {
}
