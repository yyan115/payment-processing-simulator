package dev.yycodes.paymentsimulator.provider;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;
public interface ProviderTransactionRepository extends JpaRepository<ProviderTransaction, UUID> {
    Optional<ProviderTransaction> findByClientReference(UUID clientReference);
}
