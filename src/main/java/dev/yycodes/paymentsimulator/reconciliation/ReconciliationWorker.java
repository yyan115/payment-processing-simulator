package dev.yycodes.paymentsimulator.reconciliation;

import dev.yycodes.paymentsimulator.payout.PayoutProcessor;
import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.payout.PayoutStatus;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
        prefix = "payments.reconciliation",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class ReconciliationWorker {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationWorker.class);

    private final PayoutRepository payouts;
    private final PayoutProcessor processor;

    public ReconciliationWorker(PayoutRepository payouts, PayoutProcessor processor) {
        this.payouts = payouts;
        this.processor = processor;
    }

    @Scheduled(fixedDelayString = "${payments.reconciliation.interval-ms:30000}")
    public void reconcileUnknownPayouts() {
        for (var payout : payouts.findAllByStatus(PayoutStatus.UNKNOWN)) {
            try {
                ReconciliationResolution result = processor.reconcile(payout.getId());

                if (result.outcome() == ReconciliationOutcome.STILL_UNKNOWN) {
                    log.warn("automatic_reconciliation_unresolved payoutId={}", payout.getId());
                }
            } catch (ConflictException race) {
                log.debug("automatic_reconciliation_skipped payoutId={} reason=state_changed",
                        payout.getId());
            } catch (RuntimeException failure) {
                log.error("automatic_reconciliation_failed payoutId={}", payout.getId(), failure);
            }
        }
    }
}
