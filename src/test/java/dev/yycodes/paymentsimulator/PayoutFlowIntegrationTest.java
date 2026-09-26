package dev.yycodes.paymentsimulator;

import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.audit.PayoutEventType;
import dev.yycodes.paymentsimulator.payout.*;
import dev.yycodes.paymentsimulator.provider.ProviderTransactionRepository;
import dev.yycodes.paymentsimulator.provider.SimulatedOutcome;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationAttemptRepository;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationOutcome;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class PayoutFlowIntegrationTest {

    @Autowired private PayoutService payouts;
    @Autowired private PayoutProcessor processor;
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
    void repeatedCreateWithSameIdempotencyKeyReturnsSamePayout() {
        CreatePayoutRequest request = new CreatePayoutRequest("seller-42", new BigDecimal("100.00"), "sgd");

        PayoutCreationResult first = payouts.create("demo-key", request);
        PayoutCreationResult retry = payouts.create("demo-key", request);

        assertThat(first.created()).isTrue();
        assertThat(retry.created()).isFalse();
        assertThat(retry.payout().getId()).isEqualTo(first.payout().getId());
        assertThat(payoutRepository.count()).isEqualTo(1);
    }

    @Test
    void reusingIdempotencyKeyForDifferentIntentIsRejected() {
        payouts.create("demo-key", new CreatePayoutRequest(
                "seller-42", new BigDecimal("100.00"), "SGD"
        ));

        assertThatThrownBy(() -> payouts.create("demo-key", new CreatePayoutRequest(
                "seller-42", new BigDecimal("101.00"), "SGD"
        ))).isInstanceOf(ConflictException.class);
    }

    @Test
    void timeoutAfterProviderSuccessBecomesUnknownThenReconcilesToSucceeded() {
        UUID id = create("timeout-after-success");

        Payout uncertain = processor.process(id, SimulatedOutcome.TIMEOUT_AFTER_SUCCESS);

        assertThat(uncertain.getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(providerRepository.findByClientReference(id)).isPresent();

        var reconciled = processor.reconcile(id);

        assertThat(reconciled.outcome()).isEqualTo(ReconciliationOutcome.RESOLVED_SUCCEEDED);
        assertThat(reconciled.payout().getStatus()).isEqualTo(PayoutStatus.SUCCEEDED);
        assertThat(reconciled.payout().getProviderReference()).startsWith("sim_");

        assertThat(eventRepository.findByPayoutIdOrderByCreatedAtAsc(id))
                .extracting(event -> event.getEventType())
                .containsExactly(
                        PayoutEventType.PROCESSING_STARTED,
                        PayoutEventType.PROVIDER_TIMEOUT,
                        PayoutEventType.RECONCILIATION_SUCCEEDED
                );

        assertThat(reconciliationRepository.findByPayoutIdOrderByCreatedAtAsc(id))
                .singleElement()
                .satisfies(attempt -> {
                    assertThat(attempt.isProviderRecordFound()).isTrue();
                    assertThat(attempt.getOutcome()).isEqualTo(ReconciliationOutcome.RESOLVED_SUCCEEDED);
                });
    }

    @Test
    void timeoutBeforeProviderProcessingRemainsUnknownAfterReconciliation() {
        UUID id = create("timeout-before-processing");

        Payout uncertain = processor.process(id, SimulatedOutcome.TIMEOUT_BEFORE_PROCESSING);

        assertThat(uncertain.getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(providerRepository.findByClientReference(id)).isEmpty();

        var reconciled = processor.reconcile(id);

        assertThat(reconciled.outcome()).isEqualTo(ReconciliationOutcome.STILL_UNKNOWN);
        assertThat(reconciled.payout().getStatus()).isEqualTo(PayoutStatus.UNKNOWN);

        assertThat(reconciliationRepository.findByPayoutIdOrderByCreatedAtAsc(id))
                .singleElement()
                .satisfies(attempt -> {
                    assertThat(attempt.isProviderRecordFound()).isFalse();
                    assertThat(attempt.getOutcome()).isEqualTo(ReconciliationOutcome.STILL_UNKNOWN);
                });
    }

    @Test
    void providerDeclineBecomesFailed() {
        UUID id = create("decline-key");

        Payout result = processor.process(id, SimulatedOutcome.DECLINED);

        assertThat(result.getStatus()).isEqualTo(PayoutStatus.FAILED);
        assertThat(result.getProviderReference()).startsWith("sim_");
    }

    private UUID create(String key) {
        return payouts.create(key, new CreatePayoutRequest(
                "seller-42", new BigDecimal("100.00"), "SGD"
        )).payout().getId();
    }
}
