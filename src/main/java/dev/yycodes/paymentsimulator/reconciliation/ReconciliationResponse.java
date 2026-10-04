package dev.yycodes.paymentsimulator.reconciliation;

import dev.yycodes.paymentsimulator.payout.PayoutResponse;

public record ReconciliationResponse(ReconciliationOutcome outcome, PayoutResponse payout) {
    public static ReconciliationResponse from(ReconciliationResolution resolution) {
        return new ReconciliationResponse(
                resolution.outcome(), PayoutResponse.from(resolution.payout()));
    }
}
