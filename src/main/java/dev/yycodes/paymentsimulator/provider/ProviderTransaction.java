package dev.yycodes.paymentsimulator.provider;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "provider_transactions")
public class ProviderTransaction {

    @Id private UUID id;

    @Column(name = "client_reference", nullable = false, unique = true, updatable = false)
    private UUID clientReference;

    @Column(name = "provider_reference", nullable = false, unique = true, updatable = false)
    private String providerReference;

    @Column(nullable = false, precision = 19, scale = 4, updatable = false)
    private BigDecimal amount;

    @Column(nullable = false, length = 3, updatable = false)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProviderStatus status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ProviderTransaction() {}

    public String getProviderReference() {
        return providerReference;
    }

    public ProviderStatus getStatus() {
        return status;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
