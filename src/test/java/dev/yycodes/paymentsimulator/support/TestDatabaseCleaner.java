package dev.yycodes.paymentsimulator.support;

import org.springframework.jdbc.core.JdbcTemplate;

public final class TestDatabaseCleaner {

    private TestDatabaseCleaner() {}

    public static void clean(JdbcTemplate jdbc) {
        jdbc.execute(
                """
                TRUNCATE TABLE
                    ledger_entries,
                    ledger_transactions,
                    reconciliation_attempts,
                    payout_events,
                    provider_transactions,
                    payouts,
                    demo_sessions,
                    sandbox_call_budget
                CASCADE
                """);
    }
}
