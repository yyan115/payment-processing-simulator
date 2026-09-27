package dev.yycodes.paymentsimulator.provider;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface ProviderTransactionRepository
        extends JpaRepository<ProviderTransaction, UUID> {

    Optional<ProviderTransaction> findByClientReference(UUID clientReference);

    @Modifying
    @Query(value = """
            INSERT INTO provider_transactions
                (id, client_reference, provider_reference, amount, currency,
                 status, created_at, updated_at)
            VALUES
                (:id, :clientReference, :providerReference, :amount, :currency,
                 :status, :createdAt, :createdAt)
            ON CONFLICT (client_reference) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(
            @Param("id") UUID id,
            @Param("clientReference") UUID clientReference,
            @Param("providerReference") String providerReference,
            @Param("amount") BigDecimal amount,
            @Param("currency") String currency,
            @Param("status") String status,
            @Param("createdAt") Instant createdAt
    );

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            UPDATE provider_transactions
            SET status = :newStatus,
                updated_at = :updatedAt
            WHERE client_reference = :clientReference
              AND status = :expectedStatus
            """, nativeQuery = true)
    int updateStatusIfCurrent(
            @Param("clientReference") UUID clientReference,
            @Param("expectedStatus") String expectedStatus,
            @Param("newStatus") String newStatus,
            @Param("updatedAt") Instant updatedAt
    );
}
