package dev.yycodes.paymentsimulator.provider.visa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.yycodes.paymentsimulator.provider.ProviderRequestException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class VisaDirectPayloadFactoryTest {
    private final VisaDirectPayloadFactory factory =
            new VisaDirectPayloadFactory(
                    JsonMapper.builder().build(),
                    "408999",
                    "4957030420210454",
                    "4653459515756154",
                    "MD");

    @Test
    void identifiersAreDerivedFromTheReferenceSoAResendCarriesTheSameOnes() throws Exception {
        UUID reference = UUID.randomUUID();
        var mapper = JsonMapper.builder().build();
        var first =
                mapper.readTree(
                        factory.createPayload(
                                reference,
                                new BigDecimal("53.0000"),
                                "USD",
                                Instant.parse("2026-10-02T10:00:00Z")));
        var resend =
                mapper.readTree(
                        factory.createPayload(
                                reference,
                                new BigDecimal("53.0000"),
                                "USD",
                                Instant.parse("2026-10-02T10:05:00Z")));

        for (String field :
                new String[] {
                    "transactionIdentifier", "retrievalReferenceNumber", "systemsTraceAuditNumber"
                }) assertThat(first.path(field).asText()).isEqualTo(resend.path(field).asText());
        assertThat(first.path("transactionIdentifier").asText()).matches("[1-9]\\d{14}");
        assertThat(first.path("retrievalReferenceNumber").asText()).matches("[1-9]\\d{11}");
        assertThat(first.path("systemsTraceAuditNumber").asText()).matches("[1-9]\\d{5}");
        assertThat(first.path("transactionIdentifier").asText())
                .isEqualTo(VisaDirectPayloadFactory.transactionIdentifier(reference));
    }

    @Test
    void theRetrievalReferenceNumberAlwaysHasAValidDayOfTheYear() {
        // Visa rejects a retrieval reference number whose day of the year is outside 001 to 366.
        for (int i = 0; i < 5000; i++) {
            String rrn = VisaDirectPayloadFactory.retrievalReferenceNumber(UUID.randomUUID());
            assertThat(rrn).matches("\\d{12}");
            int day = Integer.parseInt(rrn.substring(1, 4));
            assertThat(day).isBetween(1, 366);
        }
    }

    @Test
    void differentPaymentsGetDifferentIdentifiers() {
        assertThat(VisaDirectPayloadFactory.transactionIdentifier(UUID.randomUUID()))
                .isNotEqualTo(VisaDirectPayloadFactory.transactionIdentifier(UUID.randomUUID()));
    }

    @Test
    void carriesTheAmountCurrencyAndConfiguredAccounts() throws Exception {
        var node =
                JsonMapper.builder()
                        .build()
                        .readTree(
                                factory.createPayload(
                                        UUID.randomUUID(),
                                        new BigDecimal("124.05"),
                                        "USD",
                                        Instant.parse("2026-10-02T17:45:00Z")));
        assertThat(node.path("amount").asText()).isEqualTo("124.05");
        assertThat(node.path("transactionCurrencyCode").asText()).isEqualTo("USD");
        assertThat(node.path("recipientPrimaryAccountNumber").asText())
                .isEqualTo("4957030420210454");
        assertThat(node.path("senderAccountNumber").asText()).isEqualTo("4653459515756154");
        assertThat(node.path("acquiringBin").asText()).isEqualTo("408999");
        assertThat(node.path("businessApplicationId").asText()).isEqualTo("MD");
        assertThat(node.path("localTransactionDateTime").asText()).isEqualTo("2026-10-02T17:45:00");
    }

    @Test
    void anAmountWithMoreThanTwoDecimalPlacesIsAnInvalidRequest() {
        assertThatThrownBy(
                        () ->
                                factory.createPayload(
                                        UUID.randomUUID(),
                                        new BigDecimal("1.001"),
                                        "KWD",
                                        Instant.parse("2026-10-02T10:00:00Z")))
                .isInstanceOf(ProviderRequestException.class);
    }
}
