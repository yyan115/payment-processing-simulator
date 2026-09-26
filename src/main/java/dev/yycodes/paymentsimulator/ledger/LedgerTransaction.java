package dev.yycodes.paymentsimulator.ledger;

import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ledger_transactions")
public class LedgerTransaction {

    @Id
    private UUID id;

    @Column(name = "payout_id", nullable = false, unique = true, updatable = false)
    private UUID payoutId;

    @Enumerated(EnumType.STRING)
    @Column(name = "transaction_type", nullable = false, updatable = false)
    private LedgerTransactionType transactionType;

    @Column(nullable = false, precision = 19, scale = 4, updatable = false)
    private BigDecimal amount;

    @Column(nullable = false, length = 3, updatable = false)
    private String currency;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected LedgerTransaction() {
    }

    public LedgerTransaction(UUID payoutId, BigDecimal amount, String currency) {
        this.id = UUID.randomUUID();
        this.payoutId = payoutId;
        this.transactionType = LedgerTransactionType.PAYOUT_CONFIRMED;
        this.amount = amount;
        this.currency = currency;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getPayoutId() { return payoutId; }
    public LedgerTransactionType getTransactionType() { return transactionType; }
    public BigDecimal getAmount() { return amount; }
    public String getCurrency() { return currency; }
    public Instant getCreatedAt() { return createdAt; }
}
