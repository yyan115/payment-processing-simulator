package dev.yycodes.paymentsimulator;

import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.audit.PayoutEventType;
import dev.yycodes.paymentsimulator.ledger.*;
import dev.yycodes.paymentsimulator.payout.*;
import dev.yycodes.paymentsimulator.provider.*;
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

@SpringBootTest(properties = "payments.reconciliation.enabled=false")
class PayoutFlowIntegrationTest {

    @Autowired private PayoutService payouts;
    @Autowired private PayoutProcessor processor;
    @Autowired private PayoutStateService states;
    @Autowired private PaymentProvider provider;
    @Autowired private PayoutRepository payoutRepository;
    @Autowired private ProviderTransactionRepository providerRepository;
    @Autowired private SimulatedProviderStore providerStore;
    @Autowired private PayoutEventRepository eventRepository;
    @Autowired private ReconciliationAttemptRepository reconciliationRepository;
    @Autowired private SimulationScenarioRegistry scenarios;
    @Autowired private LedgerTransactionRepository ledgerTransactions;
    @Autowired private LedgerEntryRepository ledgerEntries;

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
    void repeatedCreateWithSameIdempotencyKeyReturnsSamePayout() {
        CreatePayoutRequest request = new CreatePayoutRequest(
                "seller-42",
                new BigDecimal("100.00"),
                "sgd"
        );

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

        assertThatThrownBy(() -> payouts.create(
                "demo-key",
                new CreatePayoutRequest(
                        "seller-42",
                        new BigDecimal("101.00"),
                        "SGD"
                )
        )).isInstanceOf(ConflictException.class);
    }

    @Test
    void directSuccessPostsBalancedLedgerExactlyOnce() {
        UUID id = create("direct-success");

        Payout result = processor.process(id);

        assertThat(result.getStatus()).isEqualTo(PayoutStatus.SUCCEEDED);
        assertBalancedLedger(id, new BigDecimal("100.00"));
    }

    @Test
    void providerUnknownRemainsUnknownUntilReconciliation() {
        UUID id = create("provider-unknown");
        scenarios.configure(id, SimulatedOutcome.UNKNOWN);

        Payout result = processor.process(id);

        assertThat(result.getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(result.getProviderReference()).startsWith("sim_");
        assertThat(ledgerTransactions.findByPayoutId(id)).isEmpty();

        var reconciliation = processor.reconcile(id);

        assertThat(reconciliation.outcome())
                .isEqualTo(ReconciliationOutcome.STILL_UNKNOWN);
        assertThat(reconciliation.payout().getStatus())
                .isEqualTo(PayoutStatus.UNKNOWN);
    }

    @Test
    void pendingProviderResultCanLaterResolveToSuccess() {
        UUID id = create("pending-to-success");
        scenarios.configure(id, SimulatedOutcome.PENDING);

        Payout pending = processor.process(id);

        assertThat(pending.getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(ledgerTransactions.count()).isZero();

        providerStore.updateStatus(id, ProviderStatus.SUCCEEDED);
        var reconciled = processor.reconcile(id);

        assertThat(reconciled.outcome())
                .isEqualTo(ReconciliationOutcome.RESOLVED_SUCCEEDED);
        assertThat(reconciled.payout().getStatus())
                .isEqualTo(PayoutStatus.SUCCEEDED);
        assertBalancedLedger(id, new BigDecimal("100.00"));
    }

    @Test
    void unknownProviderResultCanLaterResolveToDecline() {
        UUID id = create("unknown-to-decline");
        scenarios.configure(id, SimulatedOutcome.UNKNOWN);

        assertThat(processor.process(id).getStatus())
                .isEqualTo(PayoutStatus.UNKNOWN);

        providerStore.updateStatus(id, ProviderStatus.DECLINED);
        var reconciled = processor.reconcile(id);

        assertThat(reconciled.outcome())
                .isEqualTo(ReconciliationOutcome.RESOLVED_FAILED);
        assertThat(reconciled.payout().getStatus())
                .isEqualTo(PayoutStatus.FAILED);
        assertThat(ledgerTransactions.count()).isZero();
    }

    @Test
    void terminalProviderStatusCannotBeRewrittenBySimulator() {
        UUID id = create("terminal-provider-state");

        assertThat(processor.process(id).getStatus())
                .isEqualTo(PayoutStatus.SUCCEEDED);

        assertThatThrownBy(() -> providerStore.updateStatus(
                id,
                ProviderStatus.DECLINED
        )).isInstanceOf(ConflictException.class);

        assertThat(providerStore.find(id).orElseThrow().status())
                .isEqualTo(ProviderStatus.SUCCEEDED);
    }

    @Test
    void providerSuccessCanBeRecoveredAfterLocalFinalizeCrashWindow() {
        UUID id = create("crash-after-provider-success");

        Payout processing = states.markProcessing(id);
        ProviderResult providerResult = provider.submit(
                processing.getId(),
                processing.getAmount(),
                processing.getCurrency(),
                SubmissionMode.ORIGINAL
        );

        assertThat(providerResult.status()).isEqualTo(ProviderStatus.SUCCEEDED);
        assertThat(payoutRepository.findById(id).orElseThrow().getStatus())
                .isEqualTo(PayoutStatus.PROCESSING);
        assertThat(providerRepository.count()).isEqualTo(1);
        assertThat(ledgerTransactions.count()).isZero();

        var recovered = processor.reconcile(id);

        assertThat(recovered.outcome())
                .isEqualTo(ReconciliationOutcome.RESOLVED_SUCCEEDED);
        assertThat(recovered.payout().getStatus())
                .isEqualTo(PayoutStatus.SUCCEEDED);
        assertBalancedLedger(id, new BigDecimal("100.00"));
    }

    @Test
    void staleProcessingWithNoProviderRecordBecomesUnknown() {
        UUID id = create("crash-before-provider-call");

        states.markProcessing(id);

        var recovered = processor.reconcile(id);

        assertThat(recovered.outcome())
                .isEqualTo(ReconciliationOutcome.STILL_UNKNOWN);
        assertThat(recovered.payout().getStatus())
                .isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(providerRepository.count()).isZero();
        assertThat(ledgerTransactions.count()).isZero();

        assertThat(eventRepository.findByPayoutIdOrderByCreatedAtAsc(id))
                .extracting(event -> event.getEventType())
                .containsExactly(
                        PayoutEventType.PROCESSING_STARTED,
                        PayoutEventType.RECONCILIATION_UNRESOLVED
                );
    }

    @Test
    void maximumRecipientLengthCanStillPostLedger() {
        String recipient = "r".repeat(255);
        UUID id = payouts.create(
                "long-recipient",
                new CreatePayoutRequest(
                        recipient,
                        new BigDecimal("100.00"),
                        "SGD"
                )
        ).payout().getId();

        assertThat(processor.process(id).getStatus())
                .isEqualTo(PayoutStatus.SUCCEEDED);
        assertBalancedLedger(id, new BigDecimal("100.00"));
    }

    @Test
    void timeoutAfterProviderSuccessBecomesUnknownThenReconcilesToSucceeded() {
        UUID id = create("timeout-after-success");
        scenarios.configure(id, SimulatedOutcome.TIMEOUT_AFTER_SUCCESS);

        Payout uncertain = processor.process(id);

        assertThat(uncertain.getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(ledgerTransactions.findByPayoutId(id)).isEmpty();

        var reconciled = processor.reconcile(id);

        assertThat(reconciled.outcome()).isEqualTo(ReconciliationOutcome.RESOLVED_SUCCEEDED);
        assertThat(reconciled.payout().getStatus()).isEqualTo(PayoutStatus.SUCCEEDED);
        assertBalancedLedger(id, new BigDecimal("100.00"));

        assertThat(eventRepository.findByPayoutIdOrderByCreatedAtAsc(id))
                .extracting(event -> event.getEventType())
                .containsExactly(
                        PayoutEventType.PROCESSING_STARTED,
                        PayoutEventType.PROVIDER_TIMEOUT,
                        PayoutEventType.RECONCILIATION_SUCCEEDED
                );
    }

    @Test
    void timeoutBeforeProviderProcessingRemainsUnknownWithoutLedgerPosting() {
        UUID id = create("timeout-before-processing");
        scenarios.configure(id, SimulatedOutcome.TIMEOUT_BEFORE_PROCESSING);

        assertThat(processor.process(id).getStatus()).isEqualTo(PayoutStatus.UNKNOWN);

        var reconciled = processor.reconcile(id);

        assertThat(reconciled.outcome()).isEqualTo(ReconciliationOutcome.STILL_UNKNOWN);
        assertThat(ledgerTransactions.findByPayoutId(id)).isEmpty();
    }

    @Test
    void retryAfterLostSuccessReturnsOriginalProviderTransactionWithoutDuplicate() {
        UUID id = create("retry-after-success");
        scenarios.configure(id, SimulatedOutcome.TIMEOUT_AFTER_SUCCESS);

        assertThat(processor.process(id).getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(providerRepository.count()).isEqualTo(1);
        assertThat(ledgerTransactions.count()).isZero();

        Payout retried = processor.retry(id);

        assertThat(retried.getStatus()).isEqualTo(PayoutStatus.SUCCEEDED);
        assertThat(providerRepository.count()).isEqualTo(1);
        assertBalancedLedger(id, new BigDecimal("100.00"));
    }

    @Test
    void retryAfterRequestNeverReachedProviderProcessesItOnce() {
        UUID id = create("retry-before-processing");
        scenarios.configure(id, SimulatedOutcome.TIMEOUT_BEFORE_PROCESSING);

        assertThat(processor.process(id).getStatus()).isEqualTo(PayoutStatus.UNKNOWN);
        assertThat(providerRepository.count()).isZero();

        Payout retried = processor.retry(id);

        assertThat(retried.getStatus()).isEqualTo(PayoutStatus.SUCCEEDED);
        assertThat(providerRepository.count()).isEqualTo(1);
        assertBalancedLedger(id, new BigDecimal("100.00"));
    }

    @Test
    void providerDeclineDoesNotPostLedger() {
        UUID id = create("decline-key");
        scenarios.configure(id, SimulatedOutcome.DECLINED);

        Payout result = processor.process(id);

        assertThat(result.getStatus()).isEqualTo(PayoutStatus.FAILED);
        assertThat(ledgerTransactions.findByPayoutId(id)).isEmpty();
    }

    private void assertBalancedLedger(UUID payoutId, BigDecimal amount) {
        LedgerTransaction transaction = ledgerTransactions
                .findByPayoutId(payoutId)
                .orElseThrow();

        var entries = ledgerEntries
                .findByTransactionIdOrderByCreatedAtAsc(transaction.getId());

        assertThat(entries).hasSize(2);
        assertThat(entries)
                .extracting(LedgerEntry::getDirection)
                .containsExactlyInAnyOrder(
                        LedgerDirection.DEBIT,
                        LedgerDirection.CREDIT
                );

        assertThat(entries).allSatisfy(entry -> {
            assertThat(entry.getAmount()).isEqualByComparingTo(amount);
            assertThat(entry.getCurrency()).isEqualTo("SGD");
        });

        assertThat(ledgerTransactions.count()).isEqualTo(1);
    }

    private UUID create(String key) {
        return payouts.create(
                key,
                new CreatePayoutRequest(
                        "seller-42",
                        new BigDecimal("100.00"),
                        "SGD"
                )
        ).payout().getId();
    }
}
