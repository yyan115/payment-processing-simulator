package dev.yycodes.paymentsimulator.reconciliation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import dev.yycodes.paymentsimulator.ledger.LedgerTransactionRepository;
import dev.yycodes.paymentsimulator.payout.CreatePayoutRequest;
import dev.yycodes.paymentsimulator.payout.PayoutProcessor;
import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.payout.PayoutService;
import dev.yycodes.paymentsimulator.payout.PayoutStatus;
import dev.yycodes.paymentsimulator.provider.SimulatedOutcome;
import dev.yycodes.paymentsimulator.provider.SimulationScenarioRegistry;
import dev.yycodes.paymentsimulator.support.TestDatabaseCleaner;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

// The scheduled worker keeps running while its context is cached, so this context is closed
// after the class and cannot reconcile payouts that belong to other tests.
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(
        properties = {
            "payments.reconciliation.enabled=true",
            "payments.reconciliation.interval-ms=200",
            "payments.reconciliation.backoff-base-ms=200",
            "payments.reconciliation.backoff-max-ms=400"
        })
class ReconciliationWorkerIntegrationTest {

    @Autowired private PayoutService payouts;
    @Autowired private PayoutProcessor processor;
    @Autowired private PayoutRepository payoutRepository;
    @Autowired private ReconciliationAttemptRepository attempts;
    @Autowired private LedgerTransactionRepository ledgerTransactions;
    @Autowired private SimulationScenarioRegistry scenarios;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void cleanDatabase() {
        scenarios.clear();
        TestDatabaseCleaner.clean(jdbc);
    }

    private UUID unknownPayout(String key, SimulatedOutcome outcome) {
        UUID id =
                payouts.create(
                                key,
                                new CreatePayoutRequest(
                                        "seller-42", new BigDecimal("100.00"), "SGD"))
                        .payout()
                        .getId();
        scenarios.configure(id, outcome);
        assertThat(processor.process(id).getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        return id;
    }

    @Test
    void theWorkerSettlesAPaymentWhoseReplyWasLost() {
        UUID id = unknownPayout("worker-lost-reply", SimulatedOutcome.TIMEOUT_AFTER_SUCCESS);

        await().atMost(Duration.ofSeconds(15))
                .untilAsserted(
                        () ->
                                assertThat(payoutRepository.findById(id).orElseThrow().getStatus())
                                        .isEqualTo(PayoutStatus.SUCCEEDED));

        assertThat(ledgerTransactions.findByPayoutId(id)).isPresent();
    }

    @Test
    void theWorkerKeepsCheckingAPaymentTheNetworkCannotReport() {
        UUID id = unknownPayout("worker-no-result", SimulatedOutcome.UNKNOWN);

        await().atMost(Duration.ofSeconds(15))
                .untilAsserted(
                        () ->
                                assertThat(attempts.findByPayoutIdOrderByCreatedAtAsc(id))
                                        .hasSizeGreaterThanOrEqualTo(2));

        assertThat(payoutRepository.findById(id).orElseThrow().getStatus())
                .isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(ledgerTransactions.findByPayoutId(id)).isEmpty();
    }
}
