package dev.yycodes.paymentsimulator.ledger;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface LedgerTransactionRepository extends JpaRepository<LedgerTransaction, UUID> {
    Optional<LedgerTransaction> findByPayoutId(UUID payoutId);
    boolean existsByPayoutId(UUID payoutId);
}
