package dev.yycodes.paymentsimulator.reconciliation;

import dev.yycodes.paymentsimulator.payout.Payout;
import dev.yycodes.paymentsimulator.payout.PayoutProcessor;
import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.payout.PayoutStatus;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.stream.Stream;

@Component
@ConditionalOnProperty(
        prefix = "payments.reconciliation",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class ReconciliationWorker {

    private static final Logger log =
            LoggerFactory.getLogger(ReconciliationWorker.class);

    private final PayoutRepository payouts;
    private final PayoutProcessor processor;
    private final long processingStaleMs;

    public ReconciliationWorker(
            PayoutRepository payouts,
            PayoutProcessor processor,
            @Value("${payments.reconciliation.processing-stale-ms:60000}")
            long processingStaleMs) {
        this.payouts = payouts;
        this.processor = processor;
        this.processingStaleMs = processingStaleMs;
    }

    @Scheduled(fixedDelayString = "${payments.reconciliation.interval-ms:30000}")
    public void reconcileRecoverablePayouts() {
        Instant staleCutoff = Instant.now().minusMillis(processingStaleMs);

        Stream.concat(
                payouts.findAllByStatus(PayoutStatus.UNKNOWN).stream(),
                payouts.findAllByStatusAndUpdatedAtBefore(
                        PayoutStatus.PROCESSING,
                        staleCutoff
                ).stream()
        ).map(Payout::getId)
         .distinct()
         .forEach(this::reconcile);
    }

    private void reconcile(java.util.UUID payoutId) {
        try {
            ReconciliationResolution result = processor.reconcile(payoutId);

            if (result.outcome() == ReconciliationOutcome.STILL_UNKNOWN) {
                log.warn(
                        "automatic_reconciliation_unresolved payoutId={}",
                        payoutId
                );
            }
        } catch (ConflictException race) {
            log.debug(
                    "automatic_reconciliation_skipped payoutId={} reason=state_changed",
                    payoutId
            );
        } catch (RuntimeException failure) {
            log.error(
                    "automatic_reconciliation_failed payoutId={}",
                    payoutId,
                    failure
            );
        }
    }
}
