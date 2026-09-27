package dev.yycodes.paymentsimulator.demo;

public class DemoException extends RuntimeException {
    private final int status;

    public DemoException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int status() {
        return status;
    }
}
