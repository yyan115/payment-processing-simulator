package dev.yycodes.paymentsimulator.payout;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.yycodes.paymentsimulator.support.TestDatabaseCleaner;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "payments.reconciliation.enabled=false")
class DatabaseDomainConstraintsIntegrationTest {

    @Autowired private PayoutService payouts;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        TestDatabaseCleaner.clean(jdbc);
    }

    @Test
    void postgresRejectsInvalidPayoutStatus() {
        UUID payoutId = create("invalid-status");

        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "UPDATE payouts SET status = 'BOGUS', version = version + 1 WHERE id = ?",
                                        payoutId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void postgresRejectsNonIsoShapedCurrency() {
        UUID payoutId = create("invalid-currency");

        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "UPDATE payouts SET currency = 'sgd', version = version + 1 WHERE id = ?",
                                        payoutId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void postgresRejectsMalformedRequestFingerprint() {
        UUID payoutId = create("invalid-fingerprint");

        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        """
                UPDATE payouts
                SET request_fingerprint = 'not-a-sha256',
                    version = version + 1
                WHERE id = ?
                """,
                                        payoutId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void simulatedProviderTransactionMustReferenceExistingPayout() {
        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        """
                INSERT INTO provider_transactions
                    (id, client_reference, provider_reference, amount,
                     currency, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                                        UUID.randomUUID(),
                                        UUID.randomUUID(),
                                        "sim_orphan",
                                        new BigDecimal("1.00"),
                                        "SGD",
                                        "SUCCEEDED"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void postgresRejectsInvalidAuditEventTypeOnInsert() {
        UUID payoutId = create("invalid-event");

        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        """
                INSERT INTO payout_events
                    (id, payout_id, event_type, from_status, to_status, created_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                                        UUID.randomUUID(),
                                        payoutId,
                                        "MADE_UP_EVENT",
                                        "CREATED",
                                        "PROCESSING"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private UUID create(String key) {
        return payouts.create(
                        key, new CreatePayoutRequest("seller-42", new BigDecimal("100.00"), "SGD"))
                .payout()
                .getId();
    }
}
