package dev.yycodes.paymentsimulator.payout;

import java.util.List;

public record PayoutPage(List<PayoutResponse> items, long total, int page, int size) {}
