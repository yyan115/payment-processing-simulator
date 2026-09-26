package dev.yycodes.paymentsimulator.payout;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
public record CreatePayoutRequest(
        @NotBlank @Size(max = 255) String recipientReference,
        @NotNull @DecimalMin(value = "0.01") BigDecimal amount,
        @NotBlank @Pattern(regexp = "[A-Za-z]{3}") String currency
) {}
