package dev.yycodes.paymentsimulator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.ledger.LedgerEntryRepository;
import dev.yycodes.paymentsimulator.ledger.LedgerTransactionRepository;
import dev.yycodes.paymentsimulator.payout.CreatePayoutRequest;
import dev.yycodes.paymentsimulator.payout.PayoutProcessor;
import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.payout.PayoutService;
import dev.yycodes.paymentsimulator.provider.ProviderTransactionRepository;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationAttemptRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = "payments.reconciliation.enabled=false")
class LedgerDatabaseInvariantIntegrationTest {

    @Autowired private PayoutService payouts;
    @Autowired private PayoutProcessor processor;
    @Autowired private PayoutRepository payoutRepository;
    @Autowired private ProviderTransactionRepository providerTransactions;
    @Autowired private PayoutEventRepository payoutEvents;
    @Autowired private ReconciliationAttemptRepository reconciliationAttempts;
    @Autowired private LedgerTransactionRepository ledgerTransactions;
    @Autowired private LedgerEntryRepository ledgerEntries;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private TransactionTemplate transactions;

    @BeforeEach
    void cleanDatabase() {
        TestDatabaseCleaner.clean(jdbc);
    }

    @Test
    void postgresRejectsImbalancedJournalAtCommit() {
        UUID payoutId =
                payouts.create(
                                "db-balance-check",
                                new CreatePayoutRequest(
                                        "seller-42", new BigDecimal("100.00"), "SGD"))
                        .payout()
                        .getId();

        UUID transactionId = UUID.randomUUID();

        assertThatThrownBy(
                        () ->
                                transactions.executeWithoutResult(
                                        status -> {
                                            jdbc.update(
                                                    """
                    INSERT INTO ledger_transactions
                        (id, payout_id, transaction_type, amount, currency, created_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                                                    transactionId,
                                                    payoutId,
                                                    "PAYOUT_CONFIRMED",
                                                    new BigDecimal("100.00"),
                                                    "SGD");

                                            jdbc.update(
                                                    """
                    INSERT INTO ledger_entries
                        (id, transaction_id, account_code, direction,
                         amount, currency, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                                                    UUID.randomUUID(),
                                                    transactionId,
                                                    "SELLER_PAYABLE:seller-42",
                                                    "DEBIT",
                                                    new BigDecimal("100.00"),
                                                    "SGD");
                                        }))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThat(ledgerTransactions.findByPayoutId(payoutId)).isEmpty();
        assertThat(ledgerEntries.count()).isZero();
    }

    @Test
    void postgresRejectsCurrencyMismatchInsideJournal() {
        UUID payoutId =
                payouts.create(
                                "db-currency-check",
                                new CreatePayoutRequest(
                                        "seller-42", new BigDecimal("100.00"), "SGD"))
                        .payout()
                        .getId();

        UUID transactionId = UUID.randomUUID();

        assertThatThrownBy(
                        () ->
                                transactions.executeWithoutResult(
                                        status -> {
                                            jdbc.update(
                                                    """
                    INSERT INTO ledger_transactions
                        (id, payout_id, transaction_type, amount, currency, created_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                                                    transactionId,
                                                    payoutId,
                                                    "PAYOUT_CONFIRMED",
                                                    new BigDecimal("100.00"),
                                                    "SGD");

                                            insertEntry(
                                                    transactionId,
                                                    "SELLER_PAYABLE:seller-42",
                                                    "DEBIT",
                                                    "100.00",
                                                    "SGD");
                                            insertEntry(
                                                    transactionId,
                                                    "CASH_CLEARING",
                                                    "CREDIT",
                                                    "100.00",
                                                    "USD");
                                        }))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThat(ledgerTransactions.findByPayoutId(payoutId)).isEmpty();
    }

    @Test
    void postgresRejectsMutationOfCommittedJournal() {
        UUID payoutId =
                payouts.create(
                                "db-immutability-check",
                                new CreatePayoutRequest(
                                        "seller-42", new BigDecimal("100.00"), "SGD"))
                        .payout()
                        .getId();

        processor.process(payoutId);

        UUID transactionId = ledgerTransactions.findByPayoutId(payoutId).orElseThrow().getId();

        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        """
                UPDATE ledger_entries
                SET amount = amount + 1
                WHERE transaction_id = ?
                """,
                                        transactionId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("ledger rows are immutable");

        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "DELETE FROM ledger_entries WHERE transaction_id = ?",
                                        transactionId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("ledger rows are immutable");

        assertThat(ledgerEntries.findByTransactionIdOrderByCreatedAtAsc(transactionId)).hasSize(2);
    }

    private void insertEntry(
            UUID transactionId,
            String accountCode,
            String direction,
            String amount,
            String currency) {
        jdbc.update(
                """
                INSERT INTO ledger_entries
                    (id, transaction_id, account_code, direction,
                     amount, currency, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                UUID.randomUUID(),
                transactionId,
                accountCode,
                direction,
                new BigDecimal(amount),
                currency);
    }
}
