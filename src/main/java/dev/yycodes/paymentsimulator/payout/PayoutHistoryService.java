package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.audit.PayoutEventResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class PayoutHistoryService {

    private final PayoutRepository payouts;
    private final PayoutEventRepository events;

    public PayoutHistoryService(PayoutRepository payouts, PayoutEventRepository events) {
        this.payouts = payouts;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<PayoutEventResponse> events(UUID id) {
        if (!payouts.existsById(id)) {
            throw new dev.yycodes.paymentsimulator.shared.NotFoundException(
                    "Payout " + id + " was not found");
        }

        return events.findByPayoutIdOrderByCreatedAtAsc(id).stream()
                .map(PayoutEventResponse::from)
                .toList();
    }
}
