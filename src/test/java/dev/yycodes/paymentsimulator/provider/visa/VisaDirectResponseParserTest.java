package dev.yycodes.paymentsimulator.provider.visa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.yycodes.paymentsimulator.provider.ProviderStatus;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

class VisaDirectResponseParserTest {
    private final VisaDirectResponseParser parser =
            new VisaDirectResponseParser(JsonMapper.builder().build());

    @Test
    void actionCode00IsApproved() throws Exception {
        var result =
                parser.parsePush(
                        "{\"transactionIdentifier\":123456789012345,\"actionCode\":\"00\",\"approvalCode\":\"21324K\"}");
        assertThat(result.status()).isEqualTo(ProviderStatus.SUCCEEDED);
        assertThat(result.providerReference()).isEqualTo("123456789012345");
    }

    @Test
    void issuerDeclinesAreDeclined() throws Exception {
        for (String code : new String[] {"05", "14", "51", "61"})
            assertThat(parser.parsePush("{\"actionCode\":\"" + code + "\"}").status())
                    .as(code)
                    .isEqualTo(ProviderStatus.DECLINED);
    }

    @Test
    void unavailableAndTimedOutAnswersAreUnknown() throws Exception {
        for (String code : new String[] {"68", "91", "96"})
            assertThat(parser.parsePush("{\"actionCode\":\"" + code + "\"}").status())
                    .as(code)
                    .isEqualTo(ProviderStatus.UNKNOWN);
    }

    @Test
    void aReplyWithoutAnActionCodeIsUnreadable() {
        assertThatThrownBy(() -> parser.parsePush("{\"approvalCode\":\"x\"}"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void queryFindsTheMatchingApprovedTransaction() throws Exception {
        var result =
                parser.parseQuery(
                        "[{\"transactionIdentifier\":\"999\",\"actionCode\":\"05\",\"statusCode\":\"COMPLETED\"},"
                                + "{\"transactionIdentifier\":\"111\",\"actionCode\":\"00\",\"statusCode\":\"COMPLETED\"}]",
                        "111");
        assertThat(result).isPresent();
        assertThat(result.get().status()).isEqualTo(ProviderStatus.SUCCEEDED);
    }

    @Test
    void queryMapsPendingAndDeclined() throws Exception {
        assertThat(
                        parser.parseQuery(
                                        "[{\"transactionIdentifier\":\"1\",\"actionCode\":\"00\",\"statusCode\":\"PENDING\"}]",
                                        "1")
                                .orElseThrow()
                                .status())
                .isEqualTo(ProviderStatus.PENDING);
        assertThat(
                        parser.parseQuery(
                                        "[{\"transactionIdentifier\":\"1\",\"actionCode\":\"05\",\"statusCode\":\"COMPLETED\"}]",
                                        "1")
                                .orElseThrow()
                                .status())
                .isEqualTo(ProviderStatus.DECLINED);
    }

    @Test
    void noMatchingTransactionMeansNoRecord() throws Exception {
        assertThat(
                        parser.parseQuery(
                                "{\"errorMessage\":\"No transactions found for the specified input parameters\"}",
                                "1"))
                .isEmpty();
        assertThat(parser.parseQuery("[]", "1")).isEmpty();
        assertThat(
                        parser.parseQuery(
                                "[{\"transactionIdentifier\":\"2\",\"actionCode\":\"00\",\"statusCode\":\"COMPLETED\"}]",
                                "1"))
                .isEmpty();
    }

    @Test
    void anUnexpectedQueryReplyIsUnreadable() {
        assertThatThrownBy(() -> parser.parseQuery("{\"errorMessage\":\"boom\"}", "1"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
