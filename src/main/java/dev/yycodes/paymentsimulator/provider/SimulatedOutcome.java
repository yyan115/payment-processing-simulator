package dev.yycodes.paymentsimulator.provider;

public enum SimulatedOutcome {
    SUCCESS,
    DECLINED,
    UNKNOWN,
    PENDING,
    TIMEOUT_BEFORE_PROCESSING,
    TIMEOUT_AFTER_SUCCESS
}
