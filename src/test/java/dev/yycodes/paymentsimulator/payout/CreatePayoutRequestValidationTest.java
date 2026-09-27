package dev.yycodes.paymentsimulator.payout;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class CreatePayoutRequestValidationTest {

    private final Validator validator =
            Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void acceptsPositiveAmountThatFitsDatabasePrecision() {
        var request = new CreatePayoutRequest(
                "seller-42",
                new BigDecimal("0.001"),
                "KWD"
        );

        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void rejectsZeroAmount() {
        var request = new CreatePayoutRequest(
                "seller-42",
                BigDecimal.ZERO,
                "SGD"
        );

        assertThat(validator.validate(request))
                .anyMatch(violation ->
                        violation.getPropertyPath().toString().equals("amount"));
    }

    @Test
    void rejectsNegativeAmount() {
        var request = new CreatePayoutRequest(
                "seller-42",
                new BigDecimal("-1.00"),
                "SGD"
        );

        assertThat(validator.validate(request))
                .anyMatch(violation ->
                        violation.getPropertyPath().toString().equals("amount"));
    }

    @Test
    void rejectsMoreThanFourFractionDigits() {
        var request = new CreatePayoutRequest(
                "seller-42",
                new BigDecimal("100.00001"),
                "SGD"
        );

        assertThat(validator.validate(request))
                .anyMatch(violation ->
                        violation.getPropertyPath().toString().equals("amount"));
    }

    @Test
    void rejectsAmountTooLargeForNumeric19Scale4() {
        var request = new CreatePayoutRequest(
                "seller-42",
                new BigDecimal("1000000000000000.0000"),
                "SGD"
        );

        assertThat(validator.validate(request))
                .anyMatch(violation ->
                        violation.getPropertyPath().toString().equals("amount"));
    }
}
