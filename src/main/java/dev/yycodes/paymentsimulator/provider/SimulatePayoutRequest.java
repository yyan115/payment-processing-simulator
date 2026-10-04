package dev.yycodes.paymentsimulator.provider;

import jakarta.validation.constraints.NotNull;

public record SimulatePayoutRequest(@NotNull SimulatedOutcome outcome) {}
