package dev.yycodes.paymentsimulator;

import org.springframework.jdbc.core.JdbcTemplate;

final class TestDatabaseCleaner {

    private TestDatabaseCleaner() {}

    static void clean(JdbcTemplate jdbc) {
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
