package dev.yycodes.paymentsimulator.provider.mastercard;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MastercardSendRequestFactoryTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void createsMinimalDisbursementWithoutInventingIdentityData()
            throws Exception {
        UUID reference = UUID.fromString(
                "6f6f3338-8df7-41be-8e58-f23727a8a5e1"
        );

        MastercardSendRequestFactory factory = new MastercardSendRequestFactory(
                mapper,
                "",
                "pan:recipient;exp=2077-05",
                "BDB",
                "",
                "",
                null
        );

        var payment = mapper.readTree(factory.createPayload(
                reference,
                new BigDecimal("100.00"),
                "SGD"
        )).path("payment_disbursement");

        assertThat(payment.path("disbursement_reference").asText())
                .isEqualTo(reference.toString());
        assertThat(payment.path("amount").asText()).isEqualTo("10000");
        assertThat(payment.path("currency").asText()).isEqualTo("SGD");
        assertThat(payment.path("payment_type").asText()).isEqualTo("BDB");
        assertThat(payment.path("recipient_account_uri").asText())
                .isEqualTo("pan:recipient;exp=2077-05");

        assertThat(payment.has("sender")).isFalse();
        assertThat(payment.has("recipient")).isFalse();
        assertThat(payment.has("participant")).isFalse();
        assertThat(payment.has("sender_account_uri")).isFalse();
        assertThat(payment.has("funding_source")).isFalse();
        assertThat(payment.has("payment_origination_country")).isFalse();
        assertThat(payment.has("transaction_local_date_time")).isFalse();
    }

    @Test
    void includesConfiguredOnboardingFieldsAndTransactionLocalTime()
            throws Exception {
        Clock chicagoClock = Clock.fixed(
                Instant.parse("2026-09-26T22:00:00Z"),
                ZoneId.of("America/Chicago")
        );

        MastercardSendRequestFactory factory = new MastercardSendRequestFactory(
                mapper,
                "raw:sender",
                "pan:recipient;exp=2077-05",
                "BDB",
                "DEPOSIT_ACCOUNT",
                "USA",
                chicagoClock
        );

        var payment = mapper.readTree(factory.createPayload(
                UUID.randomUUID(),
                new BigDecimal("100.00"),
                "SGD"
        )).path("payment_disbursement");

        assertThat(payment.path("sender_account_uri").asText())
                .isEqualTo("raw:sender");
        assertThat(payment.path("funding_source").asText())
                .isEqualTo("DEPOSIT_ACCOUNT");
        assertThat(payment.path("payment_origination_country").asText())
                .isEqualTo("USA");
        assertThat(payment.path("transaction_local_date_time").asText())
                .isEqualTo("2026-09-26T17:00:00-05:00");
    }

    @Test
    void convertsCurrenciesUsingTheirIsoMinorUnitExponent()
            throws Exception {
        MastercardSendRequestFactory factory = new MastercardSendRequestFactory(
                mapper,
                "",
                "pan:recipient;exp=2077-05",
                "BDB",
                "",
                "",
                null
        );

        var jpy = mapper.readTree(factory.createPayload(
                UUID.randomUUID(),
                new BigDecimal("100"),
                "JPY"
        )).path("payment_disbursement");

        var kwd = mapper.readTree(factory.createPayload(
                UUID.randomUUID(),
                new BigDecimal("1.234"),
                "KWD"
        )).path("payment_disbursement");

        assertThat(jpy.path("amount").asText()).isEqualTo("100");
        assertThat(kwd.path("amount").asText()).isEqualTo("1234");
    }
}
