package dev.yycodes.paymentsimulator.provider;

import dev.yycodes.paymentsimulator.shared.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class SimulatedProviderStore {

    private final ProviderTransactionRepository repository;

    public SimulatedProviderStore(ProviderTransactionRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public ProviderResult record(
            UUID clientReference,
            BigDecimal amount,
            String currency,
            ProviderStatus status) {

        Optional<ProviderTransaction> existing = repository.findByClientReference(clientReference);
        if (existing.isPresent()) {
            return toResult(existing.get());
        }

        UUID id = UUID.randomUUID();
        String providerReference = "sim_" + UUID.randomUUID().toString().replace("-", "");

        int inserted = repository.insertIfAbsent(
                id,
                clientReference,
                providerReference,
                amount,
                currency,
                status.name(),
                Instant.now()
        );

        if (inserted == 1) {
            return new ProviderResult(providerReference, status);
        }

        return repository.findByClientReference(clientReference)
                .map(SimulatedProviderStore::toResult)
                .orElseThrow(() -> new IllegalStateException(
                        "Provider transaction lost after duplicate-safe insert"
                ));
    }

    @Transactional
    public ProviderResult updateStatus(
            UUID clientReference,
            ProviderStatus status) {

        int updated = repository.updateStatus(
                clientReference,
                status.name(),
                Instant.now()
        );

        if (updated == 0) {
            throw new NotFoundException(
                    "No provider transaction exists for payout "
                            + clientReference
            );
        }

        return repository.findByClientReference(clientReference)
                .map(SimulatedProviderStore::toResult)
                .orElseThrow(() -> new IllegalStateException(
                        "Provider transaction disappeared after status update"
                ));
    }

    @Transactional(readOnly = true)
    public Optional<ProviderResult> find(UUID clientReference) {
        return repository.findByClientReference(clientReference)
                .map(SimulatedProviderStore::toResult);
    }

    private static ProviderResult toResult(ProviderTransaction transaction) {
        return new ProviderResult(
                transaction.getProviderReference(),
                transaction.getStatus()
        );
    }
}
