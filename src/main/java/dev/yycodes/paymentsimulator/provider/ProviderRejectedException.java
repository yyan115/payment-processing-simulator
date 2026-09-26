package dev.yycodes.paymentsimulator.provider;

public class ProviderRejectedException extends RuntimeException {

    private final int statusCode;

    public ProviderRejectedException(int statusCode, String message) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() {
        return statusCode;
    }
}
