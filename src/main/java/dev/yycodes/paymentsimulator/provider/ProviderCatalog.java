package dev.yycodes.paymentsimulator.provider;

import dev.yycodes.paymentsimulator.provider.mastercard.MastercardSendDisbursementsProvider;
import dev.yycodes.paymentsimulator.shared.BadRequestException;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ProviderCatalog {
    private final SimulatedPaymentProvider simulated;
    private final ObjectProvider<MastercardSendDisbursementsProvider> mastercard;
    private final String defaultProvider;

    public ProviderCatalog(
            SimulatedPaymentProvider simulated,
            ObjectProvider<MastercardSendDisbursementsProvider> mastercard,
            @Value("${payments.provider:simulated}") String defaultProvider) {
        this.simulated = simulated;
        this.mastercard = mastercard;
        this.defaultProvider = defaultProvider;
        if (!defaultProvider.equals("simulated") && !defaultProvider.equals("mastercard"))
            throw new IllegalArgumentException("payments.provider must be simulated or mastercard");
    }

    public String resolve(String requested) {
        String name = requested == null ? defaultProvider : requested;
        if (!name.equals("simulated") && !name.equals("mastercard"))
            throw new BadRequestException("provider must be simulated or mastercard");
        return name;
    }

    public PaymentProvider require(String requested) {
        String name = resolve(requested);
        if (name.equals("simulated")) return simulated;
        var adapter = mastercard.getIfAvailable();
        if (adapter == null)
            throw new BadRequestException(
                    "Mastercard sandbox is not configured on this deployment");
        return adapter;
    }

    public boolean mastercardAvailable() {
        return mastercard.getIfAvailable() != null;
    }

    public String defaultProvider() {
        return defaultProvider;
    }
}
