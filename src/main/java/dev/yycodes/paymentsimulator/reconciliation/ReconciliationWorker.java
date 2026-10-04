package dev.yycodes.paymentsimulator.reconciliation;

import dev.yycodes.paymentsimulator.demo.DemoWorkspace;
import dev.yycodes.paymentsimulator.payout.Payout;
import dev.yycodes.paymentsimulator.payout.PayoutProcessor;
import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.payout.PayoutStatus;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
        prefix = "payments.reconciliation",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class ReconciliationWorker {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationWorker.class);

    private final PayoutRepository payouts;
    private final DemoWorkspace workspace;
    private final PayoutProcessor processor;
    private final ReconciliationAttemptRepository attempts;
    private final long processingStaleMs;
    private final ReconciliationBackoffPolicy backoff;

    public ReconciliationWorker(
            PayoutRepository payouts,
            DemoWorkspace workspace,
            PayoutProcessor processor,
            ReconciliationAttemptRepository attempts,
            @Value("${payments.reconciliation.processing-stale-ms:60000}") long processingStaleMs,
            @Value("${payments.reconciliation.backoff-base-ms:30000}") long backoffBaseMs,
            @Value("${payments.reconciliation.backoff-max-ms:240000}") long backoffMaxMs) {
        this.payouts = payouts;
        this.workspace = workspace;
        this.processor = processor;
        this.attempts = attempts;
        this.processingStaleMs = processingStaleMs;
        this.backoff = new ReconciliationBackoffPolicy(backoffBaseMs, backoffMaxMs);
    }

    @Scheduled(fixedDelayString = "${payments.reconciliation.interval-ms:30000}")
    public void reconcileRecoverablePayouts() {
        Instant now = Instant.now();
        Instant staleCutoff = now.minusMillis(processingStaleMs);

        List<Payout> unknown = payouts.findAllByStatus(PayoutStatus.UNKNOWN);
        Set<UUID> unknownIds = unknown.stream().map(Payout::getId).collect(Collectors.toSet());

        Map<UUID, ReconciliationAttemptSummary> summaries = loadAttemptSummaries(unknownIds);

        Stream<Payout> dueUnknown =
                unknown.stream()
                        .filter(
                                payout ->
                                        isDue(payout.getId(), summaries.get(payout.getId()), now));

        Stream<Payout> staleProcessing =
                payouts
                        .findAllByStatusAndUpdatedAtBefore(PayoutStatus.PROCESSING, staleCutoff)
                        .stream();

        Stream.concat(dueUnknown, staleProcessing)
                .filter(
                        payout ->
                                payout.getDemoSessionId() == null
                                        || java.util.Optional.ofNullable(
                                                        workspace.expiry(payout.getDemoSessionId()))
                                                .map(expiry -> expiry.isAfter(now))
                                                .orElse(false))
                .map(Payout::getId)
                .distinct()
                .forEach(this::reconcile);
    }

    private Map<UUID, ReconciliationAttemptSummary> loadAttemptSummaries(Set<UUID> payoutIds) {
        if (payoutIds.isEmpty()) {
            return Map.of();
        }

        return attempts.summarizeAttempts(payoutIds).stream()
                .collect(
                        Collectors.toMap(
                                ReconciliationAttemptSummary::getPayoutId, Function.identity()));
    }

    private boolean isDue(UUID payoutId, ReconciliationAttemptSummary summary, Instant now) {
        if (summary == null) {
            return true;
        }

        boolean due = backoff.isDue(summary.getAttemptCount(), summary.getLastAttemptAt(), now);

        if (!due) {
            log.debug(
                    "automatic_reconciliation_deferred payoutId={} attempts={}",
                    payoutId,
                    summary.getAttemptCount());
        }

        return due;
    }

    private void reconcile(UUID payoutId) {
        try {
            ReconciliationResolution result = processor.reconcile(payoutId);

            if (result.outcome() == ReconciliationOutcome.STILL_UNKNOWN) {
                log.warn("automatic_reconciliation_unresolved payoutId={}", payoutId);
            }
        } catch (ConflictException race) {
            log.debug(
                    "automatic_reconciliation_skipped payoutId={} reason=state_changed", payoutId);
        } catch (RuntimeException failure) {
            log.error("automatic_reconciliation_failed payoutId={}", payoutId, failure);
        }
    }
}
