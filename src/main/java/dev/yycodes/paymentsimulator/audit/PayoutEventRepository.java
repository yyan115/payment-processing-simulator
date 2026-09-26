package dev.yycodes.paymentsimulator.audit;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PayoutEventRepository extends JpaRepository<PayoutEvent, UUID> {
    List<PayoutEvent> findByPayoutIdOrderByCreatedAtAsc(UUID payoutId);
}
