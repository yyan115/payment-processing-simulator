package dev.yycodes.paymentsimulator;

import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.ledger.LedgerEntryRepository;
import dev.yycodes.paymentsimulator.ledger.LedgerTransactionRepository;
import dev.yycodes.paymentsimulator.payout.*;
import dev.yycodes.paymentsimulator.provider.ProviderTransactionRepository;
import dev.yycodes.paymentsimulator.provider.SimulatedOutcome;
import dev.yycodes.paymentsimulator.provider.SimulationScenarioRegistry;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationAttemptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "payments.reconciliation.enabled=false")
class ConcurrentProcessingIntegrationTest {

    @Autowired private PayoutService payouts;
    @Autowired private PayoutProcessor processor;
    @Autowired private PayoutRepository payoutRepository;
    @Autowired private ProviderTransactionRepository providerRepository;
    @Autowired private PayoutEventRepository eventRepository;
    @Autowired private ReconciliationAttemptRepository reconciliationRepository;
    @Autowired private LedgerTransactionRepository ledgerTransactions;
    @Autowired private LedgerEntryRepository ledgerEntries;
    @Autowired private SimulationScenarioRegistry scenarios;

    @BeforeEach
    void cleanDatabase() {
        scenarios.clear();
        ledgerEntries.deleteAll();
        ledgerTransactions.deleteAll();
        reconciliationRepository.deleteAll();
        eventRepository.deleteAll();
        providerRepository.deleteAll();
        payoutRepository.deleteAll();
    }

    @Test
    void concurrentProcessingCannotCreateTwoExternalOrLedgerTransactions() throws Exception {
        UUID id = create("concurrent-process");

        List<Payout> successes = runTogether(
                () -> processor.process(id),
                () -> processor.process(id)
        );

        assertThat(successes).hasSize(1);
        assertThat(successes.getFirst().getStatus()).isEqualTo(PayoutStatus.SUCCEEDED);
        assertThat(providerRepository.count()).isEqualTo(1);
        assertThat(ledgerTransactions.count()).isEqualTo(1);
        assertThat(ledgerEntries.count()).isEqualTo(2);
    }

    @Test
    void concurrentRetriesAfterUnknownStillProduceOneExternalAndLedgerTransaction() throws Exception {
        UUID id = create("concurrent-retry");
        scenarios.configure(id, SimulatedOutcome.TIMEOUT_BEFORE_PROCESSING);

        assertThat(processor.process(id).getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(providerRepository.count()).isZero();

        List<Payout> successes = runTogether(
                () -> processor.retry(id),
                () -> processor.retry(id)
        );

        assertThat(successes).hasSize(1);
        assertThat(successes.getFirst().getStatus()).isEqualTo(PayoutStatus.SUCCEEDED);
        assertThat(providerRepository.count()).isEqualTo(1);
        assertThat(ledgerTransactions.count()).isEqualTo(1);
        assertThat(ledgerEntries.count()).isEqualTo(2);
    }

    private List<Payout> runTogether(
            java.util.concurrent.Callable<Payout> first,
            java.util.concurrent.Callable<Payout> second) throws Exception {

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<Payout>> futures = List.of(
                    executor.submit(() -> invokeTogether(ready, start, first)),
                    executor.submit(() -> invokeTogether(ready, start, second))
            );

            ready.await();
            start.countDown();

            List<Payout> successes = new ArrayList<>();
            for (Future<Payout> future : futures) {
                try {
                    successes.add(future.get());
                } catch (ExecutionException expectedRaceLoser) {
                    // The losing request must fail instead of producing a second financial effect.
                }
            }
            return successes;
        }
    }

    private Payout invokeTogether(
            CountDownLatch ready,
            CountDownLatch start,
            java.util.concurrent.Callable<Payout> action) throws Exception {
        ready.countDown();
        start.await();
        return action.call();
    }

    private UUID create(String key) {
        return payouts.create(key, new CreatePayoutRequest(
                "seller-42",
                new BigDecimal("100.00"),
                "SGD"
        )).payout().getId();
    }
}
