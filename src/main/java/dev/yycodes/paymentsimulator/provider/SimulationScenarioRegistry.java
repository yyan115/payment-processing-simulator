package dev.yycodes.paymentsimulator.provider;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

@Component
public class SimulationScenarioRegistry {

    private final ConcurrentMap<UUID, SimulatedOutcome> scenarios = new ConcurrentHashMap<>();

    public void configure(UUID payoutId, SimulatedOutcome outcome) {
        scenarios.put(payoutId, outcome);
    }

    public SimulatedOutcome consume(UUID payoutId) {
        SimulatedOutcome configured = scenarios.remove(payoutId);
        return configured == null ? SimulatedOutcome.SUCCESS : configured;
    }

    public void remove(UUID payoutId) {
        scenarios.remove(payoutId);
    }

    public void clear() {
        scenarios.clear();
    }
}
