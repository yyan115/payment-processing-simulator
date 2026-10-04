package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.audit.*;
import dev.yycodes.paymentsimulator.demo.SandboxVerification;
import dev.yycodes.paymentsimulator.ledger.*;
import dev.yycodes.paymentsimulator.provider.ProviderCatalog;
import dev.yycodes.paymentsimulator.provider.ProviderResult;
import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import dev.yycodes.paymentsimulator.provider.SimulatedProviderStore;
import dev.yycodes.paymentsimulator.reconciliation.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/**
 * Read-only views of a payout. The snapshot returns the payout, its journal, events and
 * reconciliation attempts from one consistent read. The network's own record is included only for
 * the simulated network, because asking Mastercard or Visa is a separate, explicit call.
 */
@RestController
public class PayoutInspectionController {
    private final SandboxVerification verification;
    private final PayoutService payouts;
    private final ProviderCatalog catalog;
    private final SimulatedProviderStore provider;
    private final PayoutHistoryService history;
    private final LedgerTransactionRepository transactions;
    private final LedgerQueryService ledger;
    private final ReconciliationAttemptRepository attempts;

    public PayoutInspectionController(
            PayoutService payouts,
            SandboxVerification verification,
            ProviderCatalog catalog,
            SimulatedProviderStore provider,
            PayoutHistoryService history,
            LedgerTransactionRepository transactions,
            LedgerQueryService ledger,
            ReconciliationAttemptRepository attempts) {
        this.verification = verification;
        this.payouts = payouts;
        this.catalog = catalog;
        this.provider = provider;
        this.history = history;
        this.transactions = transactions;
        this.ledger = ledger;
        this.attempts = attempts;
    }

    @GetMapping("/api/v1/payouts/{id}/snapshot")
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
        if (!"simulated".equals(payout.getProvider())) verification.authorize(id);
        var result = catalog.require(payout.getProvider()).findByClientReference(id);
        return new ProviderObservation(result.orElse(null), Instant.now());
    }

    public record ProviderObservation(ProviderResult provider, Instant checkedAt) {}

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
