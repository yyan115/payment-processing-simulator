package dev.yycodes.paymentsimulator.shared;
import java.time.Instant;
public record ApiError(Instant timestamp, int status, String error, String message) {}
