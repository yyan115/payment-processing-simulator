package dev.yycodes.paymentsimulator.audit;

import dev.yycodes.paymentsimulator.payout.PayoutStatus;
import java.time.Instant;
import java.util.UUID;

public record PayoutEventResponse(
        UUID id,
        PayoutEventType eventType,
        PayoutStatus fromStatus,
        PayoutStatus toStatus,
        Instant createdAt) {
    public static PayoutEventResponse from(PayoutEvent event) {
        return new PayoutEventResponse(
                event.getId(),
                event.getEventType(),
                event.getFromStatus(),
                event.getToStatus(),
                event.getCreatedAt());
    }
}
