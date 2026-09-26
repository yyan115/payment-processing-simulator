package dev.yycodes.paymentsimulator.audit;

import dev.yycodes.paymentsimulator.payout.PayoutStatus;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payout_events")
public class PayoutEvent {

    @Id
    private UUID id;

    @Column(name = "payout_id", nullable = false, updatable = false)
    private UUID payoutId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, updatable = false)
    private PayoutEventType eventType;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", nullable = false, updatable = false)
    private PayoutStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, updatable = false)
    private PayoutStatus toStatus;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected PayoutEvent() {
    }

    public PayoutEvent(UUID payoutId, PayoutEventType eventType, PayoutStatus fromStatus, PayoutStatus toStatus) {
        this.id = UUID.randomUUID();
        this.payoutId = payoutId;
        this.eventType = eventType;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getPayoutId() { return payoutId; }
    public PayoutEventType getEventType() { return eventType; }
    public PayoutStatus getFromStatus() { return fromStatus; }
    public PayoutStatus getToStatus() { return toStatus; }
    public Instant getCreatedAt() { return createdAt; }
}
