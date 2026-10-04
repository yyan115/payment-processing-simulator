package dev.yycodes.paymentsimulator;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.payout.CreatePayoutRequest;
import dev.yycodes.paymentsimulator.payout.PayoutProcessor;
import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.payout.PayoutService;
import dev.yycodes.paymentsimulator.provider.ProviderTransactionRepository;
import dev.yycodes.paymentsimulator.provider.SimulatedOutcome;
import dev.yycodes.paymentsimulator.provider.SimulationScenarioRegistry;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationAttemptRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "payments.reconciliation.enabled=false")
class AuditHistoryDatabaseInvariantIntegrationTest {

    @Autowired private PayoutService payouts;
    @Autowired private PayoutProcessor processor;
    @Autowired private PayoutRepository payoutRepository;
    @Autowired private ProviderTransactionRepository providerTransactions;
    @Autowired private PayoutEventRepository payoutEvents;
    @Autowired private ReconciliationAttemptRepository reconciliationAttempts;
    @Autowired private SimulationScenarioRegistry scenarios;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        scenarios.clear();
        TestDatabaseCleaner.clean(jdbc);
    }

    @Test
    void payoutEventsCannotBeUpdatedOrDeleted() {
        UUID payoutId = create("immutable-payout-event");
        processor.process(payoutId);

        UUID eventId = payoutEvents.findByPayoutIdOrderByCreatedAtAsc(payoutId).getFirst().getId();

        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "UPDATE payout_events SET event_type = event_type WHERE id = ?",
                                        eventId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("audit history rows are immutable");

        assertThatThrownBy(() -> jdbc.update("DELETE FROM payout_events WHERE id = ?", eventId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("audit history rows are immutable");
    }

    @Test
    void reconciliationAttemptsCannotBeUpdatedOrDeleted() {
        UUID payoutId = create("immutable-reconciliation-attempt");
        scenarios.configure(payoutId, SimulatedOutcome.UNKNOWN);

        processor.process(payoutId);
        processor.reconcile(payoutId);

        UUID attemptId =
                reconciliationAttempts
                        .findByPayoutIdOrderByCreatedAtAsc(payoutId)
                        .getFirst()
                        .getId();

        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        """
                UPDATE reconciliation_attempts
                SET outcome = outcome
                WHERE id = ?
                """,
                                        attemptId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("audit history rows are immutable");

        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "DELETE FROM reconciliation_attempts WHERE id = ?",
                                        attemptId))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("audit history rows are immutable");
    }

    private UUID create(String key) {
        return payouts.create(
                        key, new CreatePayoutRequest("seller-42", new BigDecimal("100.00"), "SGD"))
                .payout()
                .getId();
    }
}
