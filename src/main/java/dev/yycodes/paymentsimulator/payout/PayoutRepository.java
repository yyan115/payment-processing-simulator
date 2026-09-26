package dev.yycodes.paymentsimulator.payout;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PayoutRepository extends JpaRepository<Payout, UUID> {
    Optional<Payout> findByIdempotencyKey(String idempotencyKey);
    List<Payout> findAllByStatus(PayoutStatus status);
    List<Payout> findAllByStatusAndUpdatedAtBefore(
            PayoutStatus status,
            Instant cutoff
    );
    long countByStatus(PayoutStatus status);
}
