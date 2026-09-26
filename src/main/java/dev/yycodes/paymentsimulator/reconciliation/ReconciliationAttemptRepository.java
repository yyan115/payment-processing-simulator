package dev.yycodes.paymentsimulator.reconciliation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ReconciliationAttemptRepository extends JpaRepository<ReconciliationAttempt, UUID> {
    List<ReconciliationAttempt> findByPayoutIdOrderByCreatedAtAsc(UUID payoutId);
}
