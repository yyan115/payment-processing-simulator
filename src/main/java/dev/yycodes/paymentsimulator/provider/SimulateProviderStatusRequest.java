package dev.yycodes.paymentsimulator.provider;

import jakarta.validation.constraints.NotNull;

public record SimulateProviderStatusRequest(
        @NotNull ProviderStatus status
) {
}
