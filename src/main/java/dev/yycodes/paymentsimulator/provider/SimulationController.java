package dev.yycodes.paymentsimulator.provider;

import dev.yycodes.paymentsimulator.payout.PayoutService;
import dev.yycodes.paymentsimulator.shared.BadRequestException;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/simulation/payouts")
public class SimulationController {

    private final PayoutService payouts;
    private final ProviderCatalog catalog;
    private final SimulationScenarioRegistry scenarios;
    private final SimulatedProviderStore providerStore;

    public SimulationController(
            PayoutService payouts,
            SimulationScenarioRegistry scenarios,
            SimulatedProviderStore providerStore,
            ProviderCatalog catalog) {
        this.payouts = payouts;
        this.catalog = catalog;
        this.scenarios = scenarios;
        this.providerStore = providerStore;
    }

    private void requireSimulated(UUID id) {
        if (!catalog.resolve(payouts.get(id).getProvider()).equals("simulated"))
            throw new BadRequestException(
                    "Failure controls are only available for simulated payouts");
    }

    @PutMapping("/{id}/next-outcome")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void configure(
            @PathVariable UUID id, @Valid @RequestBody SimulatePayoutRequest request) {
        requireSimulated(id);
        scenarios.configure(id, request.outcome());
    }

    @PutMapping("/{id}/provider-status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void updateProviderStatus(
            @PathVariable UUID id, @Valid @RequestBody SimulateProviderStatusRequest request) {
        requireSimulated(id);
        providerStore.updateStatus(id, request.status());
    }
}
