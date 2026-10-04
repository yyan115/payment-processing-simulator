package dev.yycodes.paymentsimulator.payout;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record CreatePayoutRequest(
        @NotBlank @Size(max = 255) String recipientReference,
        @NotNull @Positive @Digits(integer = 15, fraction = 4) BigDecimal amount,
        @NotBlank @Pattern(regexp = "[A-Za-z]{3}") String currency,
        @Pattern(regexp = "simulated|mastercard|visa") String provider) {
    public CreatePayoutRequest(String recipientReference, BigDecimal amount, String currency) {
        this(recipientReference, amount, currency, null);
    }
}
