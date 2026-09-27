package dev.yycodes.paymentsimulator.provider;

import dev.yycodes.paymentsimulator.shared.ConflictException;
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
            ProviderStatus requestedStatus) {

        ProviderTransaction current = repository.findByClientReference(
                        clientReference
                )
                .orElseThrow(() -> new NotFoundException(
                        "No provider transaction exists for payout "
                                + clientReference
                ));

        ProviderStatus currentStatus = current.getStatus();

        if (currentStatus == requestedStatus) {
            return toResult(current);
        }

        if (isTerminal(currentStatus)) {
            throw new ConflictException(
                    "Provider transaction "
                            + clientReference
                            + " is already terminal in "
                            + currentStatus
            );
        }

        int updated = repository.updateStatusIfCurrent(
                clientReference,
                currentStatus.name(),
                requestedStatus.name(),
                Instant.now()
        );

        if (updated == 0) {
            throw new ConflictException(
                    "Provider transaction "
                            + clientReference
                            + " changed concurrently"
            );
        }

        return repository.findByClientReference(clientReference)
                .map(SimulatedProviderStore::toResult)
                .orElseThrow(() -> new IllegalStateException(
                        "Provider transaction disappeared after status update"
                ));
    }

    private static boolean isTerminal(ProviderStatus status) {
        return status == ProviderStatus.SUCCEEDED
                || status == ProviderStatus.DECLINED;
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
