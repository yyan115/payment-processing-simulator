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
    void acceptsAmountThatFitsDatabasePrecision() {
        var request = new CreatePayoutRequest(
                "seller-42",
                new BigDecimal("999999999999999.9999"),
                "SGD"
        );

        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void rejectsMoreThanFourFractionDigits() {
        var request = new CreatePayoutRequest(
                "seller-42",
                new BigDecimal("100.00001"),
                "SGD"
        );

        assertThat(validator.validate(request))
                .anyMatch(violation -> violation.getPropertyPath().toString().equals("amount"));
    }

    @Test
    void rejectsAmountTooLargeForNumeric19Scale4() {
        var request = new CreatePayoutRequest(
                "seller-42",
                new BigDecimal("1000000000000000.0000"),
                "SGD"
        );

        assertThat(validator.validate(request))
                .anyMatch(violation -> violation.getPropertyPath().toString().equals("amount"));
    }
}
