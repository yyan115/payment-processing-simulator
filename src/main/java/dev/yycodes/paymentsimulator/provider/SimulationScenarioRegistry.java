package dev.yycodes.paymentsimulator.provider;

import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

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
