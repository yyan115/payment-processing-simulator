package dev.yycodes.paymentsimulator.provider;

import dev.yycodes.paymentsimulator.audit.*;
import dev.yycodes.paymentsimulator.ledger.*;
import dev.yycodes.paymentsimulator.payout.*;
import dev.yycodes.paymentsimulator.reconciliation.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Consistent local evidence; simulated provider truth is only included for simulated payouts. */
@RestController
public class SimulationInspectionController {
    private final PayoutService payouts;
    private final ProviderCatalog catalog;
    private final SimulatedProviderStore provider;
    private final PayoutHistoryService history;
    private final LedgerTransactionRepository transactions;
    private final LedgerQueryService ledger;
    private final ReconciliationAttemptRepository attempts;
    private final boolean automaticReconciliation;

    public SimulationInspectionController(
            PayoutService payouts,
            ProviderCatalog catalog,
            SimulatedProviderStore provider,
            PayoutHistoryService history,
            LedgerTransactionRepository transactions,
            LedgerQueryService ledger,
            ReconciliationAttemptRepository attempts,
            @Value("${payments.reconciliation.enabled:true}") boolean automaticReconciliation) {
        this.payouts = payouts;
        this.catalog = catalog;
        this.provider = provider;
        this.history = history;
        this.transactions = transactions;
        this.ledger = ledger;
        this.attempts = attempts;
        this.automaticReconciliation = automaticReconciliation;
    }

    @GetMapping("/api/v1/simulation/config")
    public Configuration configuration() {
        return new Configuration("simulated", automaticReconciliation);
    }

    @GetMapping({"/api/v1/payouts/{id}/snapshot", "/api/v1/simulation/payouts/{id}/snapshot"})
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Snapshot snapshot(@PathVariable UUID id) {
        var payout = PayoutResponse.from(payouts.get(id));
        var journal =
                transactions.findByPayoutId(id).isPresent() ? ledger.findByPayoutId(id) : null;
        return new Snapshot(
                payout,
                catalog.resolve(payout.provider()).equals("simulated")
                        ? provider.find(id).orElse(null)
                        : null,
                journal,
                history.events(id),
                attempts.findByPayoutIdOrderByCreatedAtAsc(id).stream()
                        .map(Attempt::from)
                        .toList());
    }

    @GetMapping("/api/v1/payouts/{id}/provider")
    public ProviderObservation provider(@PathVariable UUID id) {
        var payout = payouts.get(id);
        var result = catalog.require(payout.getProvider()).findByClientReference(id);
        return new ProviderObservation(result.orElse(null), Instant.now());
    }

    public record ProviderObservation(ProviderResult provider, Instant checkedAt) {}

    public record Configuration(String provider, boolean automaticReconciliation) {}

    public record Snapshot(
            PayoutResponse payout,
            ProviderResult provider,
            LedgerTransactionResponse ledger,
            List<PayoutEventResponse> events,
            List<Attempt> attempts) {}

    public record Attempt(
            UUID id,
            boolean providerRecordFound,
            ProviderStatus providerStatus,
            ReconciliationOutcome outcome,
            Instant createdAt) {
        static Attempt from(ReconciliationAttempt attempt) {
            return new Attempt(
                    attempt.getId(),
                    attempt.isProviderRecordFound(),
                    attempt.getProviderStatus(),
                    attempt.getOutcome(),
                    attempt.getCreatedAt());
        }
    }
}
