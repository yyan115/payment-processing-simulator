package dev.yycodes.paymentsimulator.payout;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PayoutRepository extends JpaRepository<Payout, UUID> {
    Page<Payout> findByDemoSessionId(UUID session, Pageable page);

    Optional<Payout> findByIdempotencyKey(String idempotencyKey);

    List<Payout> findAllByStatus(PayoutStatus status);

    List<Payout> findAllByStatusAndUpdatedAtBefore(PayoutStatus status, Instant cutoff);

    long countByStatus(PayoutStatus status);

    long countByStatusAndUpdatedAtBefore(PayoutStatus status, Instant cutoff);
}
