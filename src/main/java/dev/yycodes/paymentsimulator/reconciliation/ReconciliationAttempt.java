package dev.yycodes.paymentsimulator.reconciliation;

import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "reconciliation_attempts")
public class ReconciliationAttempt {

    @Id private UUID id;

    @Column(name = "payout_id", nullable = false, updatable = false)
    private UUID payoutId;

    @Column(name = "provider_record_found", nullable = false, updatable = false)
    private boolean providerRecordFound;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider_status", updatable = false)
    private ProviderStatus providerStatus;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private ReconciliationOutcome outcome;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected ReconciliationAttempt() {}

    public ReconciliationAttempt(
            UUID payoutId,
            boolean providerRecordFound,
            ProviderStatus providerStatus,
            ReconciliationOutcome outcome) {
        this.id = UUID.randomUUID();
        this.payoutId = payoutId;
        this.providerRecordFound = providerRecordFound;
        this.providerStatus = providerStatus;
        this.outcome = outcome;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getPayoutId() {
        return payoutId;
    }

    public boolean isProviderRecordFound() {
        return providerRecordFound;
    }

    public ProviderStatus getProviderStatus() {
        return providerStatus;
    }

    public ReconciliationOutcome getOutcome() {
        return outcome;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
