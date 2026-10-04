package dev.yycodes.paymentsimulator.reconciliation;

import java.time.Instant;

/**
 * How long to wait before reconciling a payout again. The delay doubles after each attempt, up to a
 * maximum.
 */
public class ReconciliationBackoffPolicy {

    private final long baseDelayMs;
    private final long maxDelayMs;

    public ReconciliationBackoffPolicy(long baseDelayMs, long maxDelayMs) {
        if (baseDelayMs <= 0) {
            throw new IllegalArgumentException("baseDelayMs must be positive");
        }
        if (maxDelayMs < baseDelayMs) {
            throw new IllegalArgumentException("maxDelayMs must be at least baseDelayMs");
        }

        this.baseDelayMs = baseDelayMs;
        this.maxDelayMs = maxDelayMs;
    }

    public boolean isDue(long completedAttempts, Instant lastAttemptAt, Instant now) {

        if (completedAttempts <= 0 || lastAttemptAt == null) {
            return true;
        }

        long delayMs = delayMs(completedAttempts);
        return !lastAttemptAt.plusMillis(delayMs).isAfter(now);
    }

    long delayMs(long completedAttempts) {
        long exponent = Math.max(0, completedAttempts - 1);
        long delay = baseDelayMs;

        for (long i = 0; i < exponent && delay < maxDelayMs; i++) {
            if (delay > maxDelayMs / 2) {
                return maxDelayMs;
            }
            delay *= 2;
        }

        return Math.min(delay, maxDelayMs);
    }
}
