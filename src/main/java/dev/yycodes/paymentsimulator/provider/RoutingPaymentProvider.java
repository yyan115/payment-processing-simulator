package dev.yycodes.paymentsimulator.provider;

import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.shared.NotFoundException;

import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

@Service
@Primary
public class RoutingPaymentProvider implements PaymentProvider {
    private final PayoutRepository payouts;
    private final ProviderCatalog catalog;

    public RoutingPaymentProvider(PayoutRepository payouts, ProviderCatalog catalog) {
        this.payouts = payouts;
        this.catalog = catalog;
    }

    private PaymentProvider provider(UUID id) {
        var payout =
                payouts.findById(id)
                        .orElseThrow(() -> new NotFoundException("Payout was not found"));
        return catalog.require(payout.getProvider());
    }

    @Override
    public ProviderResult submit(
            UUID reference, BigDecimal amount, String currency, SubmissionMode mode) {
        return provider(reference).submit(reference, amount, currency, mode);
    }

    @Override
    public Optional<ProviderResult> findByClientReference(UUID reference) {
        return provider(reference).findByClientReference(reference);
    }
}
