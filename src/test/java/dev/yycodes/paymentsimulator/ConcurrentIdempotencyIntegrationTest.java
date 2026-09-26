package dev.yycodes.paymentsimulator;

import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.payout.CreatePayoutRequest;
import dev.yycodes.paymentsimulator.payout.PayoutCreationResult;
import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.payout.PayoutService;
import dev.yycodes.paymentsimulator.provider.ProviderTransactionRepository;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationAttemptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "payments.reconciliation.enabled=false")
class ConcurrentIdempotencyIntegrationTest {

    @Autowired private PayoutService payouts;
    @Autowired private PayoutRepository payoutRepository;
    @Autowired private ProviderTransactionRepository providerRepository;
    @Autowired private PayoutEventRepository eventRepository;
    @Autowired private ReconciliationAttemptRepository reconciliationRepository;

    @BeforeEach
    void cleanDatabase() {
        reconciliationRepository.deleteAll();
        eventRepository.deleteAll();
        providerRepository.deleteAll();
        payoutRepository.deleteAll();
    }

    @Test
    void concurrentRequestsWithSameIdempotencyKeyCreateOnePayout() throws Exception {
        CreatePayoutRequest request = new CreatePayoutRequest(
                "seller-42", new BigDecimal("100.00"), "SGD"
        );

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Future<PayoutCreationResult>> futures = List.of(
                    executor.submit(() -> createTogether(ready, start, request)),
                    executor.submit(() -> createTogether(ready, start, request))
            );

            ready.await();
            start.countDown();

            PayoutCreationResult first = futures.get(0).get();
            PayoutCreationResult second = futures.get(1).get();

            assertThat(first.payout().getId()).isEqualTo(second.payout().getId());
            assertThat(List.of(first.created(), second.created()))
                    .containsExactlyInAnyOrder(true, false);
            assertThat(payoutRepository.count()).isEqualTo(1);
        }
    }

    private PayoutCreationResult createTogether(
            CountDownLatch ready,
            CountDownLatch start,
            CreatePayoutRequest request) throws InterruptedException {
        ready.countDown();
        start.await();
        return payouts.create("concurrent-key", request);
    }
}
