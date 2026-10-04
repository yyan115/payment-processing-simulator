package dev.yycodes.paymentsimulator.audit;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PayoutEventRepository extends JpaRepository<PayoutEvent, UUID> {
    List<PayoutEvent> findByPayoutIdOrderByCreatedAtAsc(UUID payoutId);
}
