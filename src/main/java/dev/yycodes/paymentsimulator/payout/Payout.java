package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.shared.ConflictException;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payouts")
public class Payout {

    @Id private UUID id;

    @Column(name = "idempotency_key", nullable = false, unique = true, updatable = false)
    private String idempotencyKey;

    @Column(name = "request_fingerprint", nullable = false, updatable = false, length = 64)
    private String requestFingerprint;

    @Column(name = "recipient_reference", nullable = false, updatable = false)
    private String recipientReference;

    @Column(nullable = false, precision = 19, scale = 4, updatable = false)
    private BigDecimal amount;

    @Column(nullable = false, length = 3, updatable = false)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PayoutStatus status;

    @Column(updatable = false, length = 16)
    private String provider;

    @Column(name = "demo_session_id", updatable = false)
    private UUID demoSessionId;

    @Column(name = "provider_reference")
    private String providerReference;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private long version;

    protected Payout() {}

    public Payout(
            String idempotencyKey,
            String requestFingerprint,
            String recipientReference,
            BigDecimal amount,
            String currency) {
        this.id = UUID.randomUUID();
        this.idempotencyKey = idempotencyKey;
        this.requestFingerprint = requestFingerprint;
        this.recipientReference = recipientReference;
        this.amount = amount;
        this.currency = currency;
        this.status = PayoutStatus.CREATED;
    }

    public Payout(
            String key,
            String fingerprint,
            String recipient,
            BigDecimal amount,
            String currency,
            String provider,
            UUID demoSessionId) {
        this(key, fingerprint, recipient, amount, currency);
        this.provider = provider;
        this.demoSessionId = demoSessionId;
    }

    public String getProvider() {
        return provider;
    }

    public UUID getDemoSessionId() {
        return demoSessionId;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void startProcessing() {
        requireStatus(PayoutStatus.CREATED);
        status = PayoutStatus.PROCESSING;
    }

    public void markSucceeded(String providerReference) {
        requireStatus(PayoutStatus.PROCESSING, PayoutStatus.UNKNOWN);
        this.providerReference = providerReference;
        status = PayoutStatus.SUCCEEDED;
    }

    public void markFailed(String providerReference) {
        requireStatus(PayoutStatus.PROCESSING, PayoutStatus.UNKNOWN);
        this.providerReference = providerReference;
        status = PayoutStatus.FAILED;
    }

    public void markUnknown(String providerReference) {
        requireStatus(PayoutStatus.PROCESSING, PayoutStatus.UNKNOWN);
        if (providerReference != null) {
            this.providerReference = providerReference;
        }
        status = PayoutStatus.UNKNOWN;
    }

    private void requireStatus(PayoutStatus... allowed) {
        for (PayoutStatus candidate : allowed) {
            if (status == candidate) {
                return;
            }
        }
        throw new ConflictException("Payout " + id + " cannot transition from " + status);
    }

    public UUID getId() {
        return id;
    }

    public String getRequestFingerprint() {
        return requestFingerprint;
    }

    public String getRecipientReference() {
        return recipientReference;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public PayoutStatus getStatus() {
        return status;
    }

    public String getProviderReference() {
        return providerReference;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
