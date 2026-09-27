package dev.yycodes.paymentsimulator.reconciliation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ReconciliationAttemptRepository
        extends JpaRepository<ReconciliationAttempt, UUID> {

    List<ReconciliationAttempt> findByPayoutIdOrderByCreatedAtAsc(
            UUID payoutId
    );

    @Query("""
            select
                r.payoutId as payoutId,
                count(r) as attemptCount,
                max(r.createdAt) as lastAttemptAt
            from ReconciliationAttempt r
            where r.payoutId in :payoutIds
            group by r.payoutId
            """)
    List<ReconciliationAttemptSummary> summarizeAttempts(
            @Param("payoutIds") Collection<UUID> payoutIds
    );
}
