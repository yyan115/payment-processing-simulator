package dev.yycodes.paymentsimulator.ledger;

import dev.yycodes.paymentsimulator.demo.DemoWorkspace;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ledger")
public class LedgerAccountController {

    private final JdbcTemplate jdbc;
    private final DemoWorkspace workspace;

    public LedgerAccountController(JdbcTemplate jdbc, DemoWorkspace workspace) {
        this.jdbc = jdbc;
        this.workspace = workspace;
    }

    // Running totals per account. In a demo workspace, only that workspace's payments count.
    @GetMapping("/accounts")
    @Transactional(readOnly = true)
    public List<LedgerAccountTotal> accounts() {
        UUID session = workspace.currentId();
        return jdbc.query(
                """
                SELECT e.account_code, e.currency,
                       COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'DEBIT'), 0),
                       COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'CREDIT'), 0),
                       COUNT(*)
                FROM ledger_entries e
                JOIN ledger_transactions t ON t.id = e.transaction_id
                JOIN payouts p ON p.id = t.payout_id
                WHERE (?::uuid IS NULL OR p.demo_session_id = ?::uuid)
                GROUP BY e.account_code, e.currency
                ORDER BY e.account_code, e.currency
                """,
                (rs, n) ->
                        new LedgerAccountTotal(
                                rs.getString(1),
                                rs.getString(2),
                                rs.getBigDecimal(3),
                                rs.getBigDecimal(4),
                                rs.getLong(5)),
                session,
                session);
    }

    // Every posting in order, so the caller can show the ledger as a book with running balances.
    @GetMapping("/entries")
    @Transactional(readOnly = true)
    public List<LedgerPosting> entries() {
        UUID session = workspace.currentId();
        return jdbc.query(
                """
                SELECT e.id, t.payout_id, e.account_code, e.direction, e.amount, e.currency, t.created_at
                FROM ledger_entries e
                JOIN ledger_transactions t ON t.id = e.transaction_id
                JOIN payouts p ON p.id = t.payout_id
                WHERE (?::uuid IS NULL OR p.demo_session_id = ?::uuid)
                ORDER BY t.created_at, t.id, CASE e.direction WHEN 'DEBIT' THEN 0 ELSE 1 END
                LIMIT 500
                """,
                (rs, n) ->
                        new LedgerPosting(
                                rs.getObject(1, UUID.class),
                                rs.getObject(2, UUID.class),
                                rs.getString(3),
                                LedgerDirection.valueOf(rs.getString(4)),
                                rs.getBigDecimal(5),
                                rs.getString(6),
                                rs.getTimestamp(7).toInstant()),
                session,
                session);
    }
}
