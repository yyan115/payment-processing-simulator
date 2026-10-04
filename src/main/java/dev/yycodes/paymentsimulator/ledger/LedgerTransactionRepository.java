package dev.yycodes.paymentsimulator.ledger;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LedgerTransactionRepository extends JpaRepository<LedgerTransaction, UUID> {

    Optional<LedgerTransaction> findByPayoutId(UUID payoutId);

    @Modifying
    @Query(
            value =
                    """
            INSERT INTO ledger_transactions
                (id, payout_id, transaction_type, amount, currency, created_at)
            VALUES
                (:id, :payoutId, :transactionType, :amount, :currency, :createdAt)
            ON CONFLICT (payout_id) DO NOTHING
            """,
            nativeQuery = true)
    int insertIfAbsent(
            @Param("id") UUID id,
            @Param("payoutId") UUID payoutId,
            @Param("transactionType") String transactionType,
            @Param("amount") BigDecimal amount,
            @Param("currency") String currency,
            @Param("createdAt") Instant createdAt);
}
