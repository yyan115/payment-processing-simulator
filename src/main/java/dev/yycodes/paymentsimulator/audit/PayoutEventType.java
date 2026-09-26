package dev.yycodes.paymentsimulator.audit;

public enum PayoutEventType {
    PROCESSING_STARTED,
    PROVIDER_SUCCEEDED,
    PROVIDER_DECLINED,
    PROVIDER_TIMEOUT,
    RECONCILIATION_SUCCEEDED,
    RECONCILIATION_FAILED
}
