package dev.yycodes.paymentsimulator.shared;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;
import java.util.Locale;

/**
 * Money rules shared by the API and the network adapters. Amounts stay exact decimals, and
 * conversion to minor units does not round.
 */
public final class MoneyAmounts {

    private MoneyAmounts() {}

    public static BigDecimal normalizeMajorUnits(BigDecimal amount, String currencyCode) {

        int fractionDigits = fractionDigits(currencyCode);
        BigDecimal normalized = amount.stripTrailingZeros();
        int actualFractionDigits = Math.max(normalized.scale(), 0);

        if (actualFractionDigits > fractionDigits) {
            throw new IllegalArgumentException(
                    currencyCode + " supports at most " + fractionDigits + " fractional digits");
        }

        return normalized;
    }

    public static String toMinorUnits(BigDecimal majorUnits, String currencyCode) {

        int fractionDigits = fractionDigits(currencyCode);

        try {
            BigDecimal minorUnits =
                    majorUnits.movePointRight(fractionDigits).setScale(0, RoundingMode.UNNECESSARY);

            if (minorUnits.compareTo(new BigDecimal("999999999999")) > 0) {
                throw new IllegalArgumentException(
                        "Amount exceeds the maximum of 999999999999 minor units");
            }

            return minorUnits.toPlainString();
        } catch (ArithmeticException invalidPrecision) {
            throw new IllegalArgumentException(
                    "Amount precision is invalid for " + currencyCode, invalidPrecision);
        }
    }

    public static String normalizeCurrencyCode(String currencyCode) {
        String normalized = currencyCode.toUpperCase(Locale.ROOT);
        fractionDigits(normalized);
        return normalized;
    }

    private static int fractionDigits(String currencyCode) {
        final Currency currency;
        try {
            currency = Currency.getInstance(currencyCode);
        } catch (IllegalArgumentException invalidCurrency) {
            throw new IllegalArgumentException(
                    "Unsupported ISO 4217 currency: " + currencyCode, invalidCurrency);
        }

        int digits = currency.getDefaultFractionDigits();
        if (digits < 0 || digits > 4) {
            throw new IllegalArgumentException("Unsupported currency exponent for " + currencyCode);
        }

        return digits;
    }
}
