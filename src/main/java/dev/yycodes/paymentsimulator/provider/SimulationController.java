package dev.yycodes.paymentsimulator.provider;

import dev.yycodes.paymentsimulator.payout.PayoutService;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/simulation/payouts")
@ConditionalOnProperty(
        name = "payments.provider",
        havingValue = "simulated",
        matchIfMissing = true
)
public class SimulationController {

    private final PayoutService payouts;
    private final SimulationScenarioRegistry scenarios;

    public SimulationController(PayoutService payouts, SimulationScenarioRegistry scenarios) {
        this.payouts = payouts;
        this.scenarios = scenarios;
    }

    @PutMapping("/{id}/next-outcome")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void configure(
            @PathVariable UUID id,
            @Valid @RequestBody SimulatePayoutRequest request) {
        payouts.get(id);
        scenarios.configure(id, request.outcome());
    }
}
