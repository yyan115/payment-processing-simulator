package dev.yycodes.paymentsimulator.payout;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PayoutRepository extends JpaRepository<Payout, UUID> {
    Optional<Payout> findByIdempotencyKey(String idempotencyKey);
    List<Payout> findAllByStatus(PayoutStatus status);
    long countByStatus(PayoutStatus status);
}
