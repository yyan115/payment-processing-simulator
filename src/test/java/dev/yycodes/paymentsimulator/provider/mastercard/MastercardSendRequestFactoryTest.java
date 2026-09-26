package dev.yycodes.paymentsimulator.provider.mastercard;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MastercardSendRequestFactoryTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void createsMastercardDisbursementPayloadFromStableClientReference() throws Exception {
        UUID reference = UUID.fromString("6f6f3338-8df7-41be-8e58-f23727a8a5e1");
        Clock clock = Clock.fixed(
                Instant.parse("2026-09-26T22:00:00Z"),
                ZoneOffset.UTC
        );

        MastercardSendRequestFactory factory = new MastercardSendRequestFactory(
                mapper,
                "raw:sender",
                "pan:recipient;exp=2077-05",
                clock
        );

        var root = mapper.readTree(factory.createPayload(
                reference,
                new BigDecimal("100.00"),
                "SGD"
        ));
        var payment = root.path("payment_disbursement");

        assertThat(payment.path("disbursement_reference").asText())
                .isEqualTo(reference.toString());
        assertThat(payment.path("amount").asText()).isEqualTo("100.00");
        assertThat(payment.path("currency").asText()).isEqualTo("SGD");
        assertThat(payment.path("payment_type").asText()).isEqualTo("BDB");
        assertThat(payment.path("transaction_local_date_time").asText())
                .isEqualTo("2026-09-26T22:00:00+00:00");
        assertThat(payment.path("sender_account_uri").asText())
                .isEqualTo("raw:sender");
        assertThat(payment.path("recipient_account_uri").asText())
                .isEqualTo("pan:recipient;exp=2077-05");
    }
}
