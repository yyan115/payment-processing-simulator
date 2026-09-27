package dev.yycodes.paymentsimulator.shared;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoneyAmountsTest {

    @Test
    void convertsMajorUnitsToMinorUnitsWithoutRounding() {
        assertThat(MoneyAmounts.toMinorUnits(
                new BigDecimal("100.00"),
                "SGD"
        )).isEqualTo("10000");

        assertThat(MoneyAmounts.toMinorUnits(
                new BigDecimal("100"),
                "JPY"
        )).isEqualTo("100");

        assertThat(MoneyAmounts.toMinorUnits(
                new BigDecimal("1.234"),
                "KWD"
        )).isEqualTo("1234");
    }

    @Test
    void rejectsMastercardWireAmountAbovePublishedMaximum() {
        assertThatThrownBy(() -> MoneyAmounts.toMinorUnits(
                new BigDecimal("10000000000.00"),
                "SGD"
        )).isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("maximum");
    }
}
