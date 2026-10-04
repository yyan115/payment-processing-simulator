package dev.yycodes.paymentsimulator.reconciliation;

import java.time.Instant;
import java.util.UUID;

public interface ReconciliationAttemptSummary {
    UUID getPayoutId();

    long getAttemptCount();

    Instant getLastAttemptAt();
}
