package dev.yycodes.paymentsimulator.provider;

import dev.yycodes.paymentsimulator.provider.mastercard.MastercardSendDisbursementsProvider;
import dev.yycodes.paymentsimulator.provider.visa.VisaDirectProvider;
import dev.yycodes.paymentsimulator.shared.BadRequestException;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ProviderCatalog {
    private final SimulatedPaymentProvider simulated;
    private final ObjectProvider<MastercardSendDisbursementsProvider> mastercard;
    private final ObjectProvider<VisaDirectProvider> visa;
    private final String defaultProvider;

    public ProviderCatalog(
            SimulatedPaymentProvider simulated,
            ObjectProvider<MastercardSendDisbursementsProvider> mastercard,
            ObjectProvider<VisaDirectProvider> visa,
            @Value("${payments.provider:simulated}") String defaultProvider) {
        this.simulated = simulated;
        this.mastercard = mastercard;
        this.visa = visa;
        this.defaultProvider = defaultProvider;
        if (!known(defaultProvider))
            throw new IllegalArgumentException(
                    "payments.provider must be simulated, mastercard or visa");
    }

    public String resolve(String requested) {
        String name = requested == null ? defaultProvider : requested;
        if (!known(name))
            throw new BadRequestException("provider must be simulated, mastercard or visa");
        return name;
    }

    public PaymentProvider require(String requested) {
        String name = resolve(requested);
        if (name.equals("simulated")) return simulated;
        if (name.equals("visa")) {
            var adapter = visa.getIfAvailable();
            if (adapter == null)
                throw new BadRequestException("Visa sandbox is not configured on this deployment");
            return adapter;
        }
        var adapter = mastercard.getIfAvailable();
        if (adapter == null)
            throw new BadRequestException(
                    "Mastercard sandbox is not configured on this deployment");
        return adapter;
    }

    private static boolean known(String name) {
        return name.equals("simulated") || name.equals("mastercard") || name.equals("visa");
    }

    public boolean visaAvailable() {
        return visa.getIfAvailable() != null;
    }

    public boolean mastercardAvailable() {
        return mastercard.getIfAvailable() != null;
    }

    public String defaultProvider() {
        return defaultProvider;
    }
}
