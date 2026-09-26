package dev.yycodes.paymentsimulator.provider;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

@Service
public class SimulatedProviderStore {
    private final ProviderTransactionRepository repository;
    public SimulatedProviderStore(ProviderTransactionRepository repository) { this.repository = repository; }

    @Transactional
    public ProviderResult record(UUID clientReference, BigDecimal amount, String currency, ProviderStatus status) {
        return repository.findByClientReference(clientReference)
                .map(SimulatedProviderStore::toResult)
                .orElseGet(() -> toResult(repository.saveAndFlush(
                        new ProviderTransaction(clientReference, amount, currency, status))));
    }

    @Transactional(readOnly = true)
    public Optional<ProviderResult> find(UUID clientReference) {
        return repository.findByClientReference(clientReference).map(SimulatedProviderStore::toResult);
    }

    private static ProviderResult toResult(ProviderTransaction tx) {
        return new ProviderResult(tx.getProviderReference(), tx.getStatus());
    }
}
