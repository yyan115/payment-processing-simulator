package dev.yycodes.paymentsimulator.reconciliation;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class ReconciliationBackoffPolicyTest {

    private final ReconciliationBackoffPolicy policy =
            new ReconciliationBackoffPolicy(30_000, 240_000);

    @Test
    void firstReconciliationIsImmediatelyDue() {
        assertThat(policy.isDue(0, null, Instant.parse("2026-09-27T05:00:00Z"))).isTrue();
    }

    @Test
    void delayDoublesAndThenCaps() {
        assertThat(policy.delayMs(1)).isEqualTo(30_000);
        assertThat(policy.delayMs(2)).isEqualTo(60_000);
        assertThat(policy.delayMs(3)).isEqualTo(120_000);
        assertThat(policy.delayMs(4)).isEqualTo(240_000);
        assertThat(policy.delayMs(20)).isEqualTo(240_000);
    }

    @Test
    void unresolvedPayoutIsDeferredUntilItsBackoffExpires() {
        Instant lastAttempt = Instant.parse("2026-09-27T05:00:00Z");

        assertThat(policy.isDue(3, lastAttempt, Instant.parse("2026-09-27T05:01:59Z"))).isFalse();

        assertThat(policy.isDue(3, lastAttempt, Instant.parse("2026-09-27T05:02:00Z"))).isTrue();
    }
}
