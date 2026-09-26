package dev.yycodes.paymentsimulator.provider.mastercard;

import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

class MastercardSendResponseParserTest {

    private final MastercardSendResponseParser parser =
            new MastercardSendResponseParser(JsonMapper.builder().build());

    @Test
    void parsesApprovedCreateResponse() throws Exception {
        String body = """
                {
                  "disbursement": {
                    "id": "dsb_example",
                    "status": "APPROVED"
                  }
                }
                """;

        var result = parser.parseCreate(body);

        assertThat(result.providerReference()).isEqualTo("dsb_example");
        assertThat(result.status()).isEqualTo(ProviderStatus.SUCCEEDED);
    }

    @Test
    void mapsUnknownAndPendingWithoutCallingThemFailures() throws Exception {
        String unknown = """
                {
                  "disbursement": {
                    "id": "dsb_unknown",
                    "status": "UNKNOWN"
                  }
                }
                """;
        String pending = """
                {
                  "disbursement": {
                    "id": "dsb_pending",
                    "status": "PENDING"
                  }
                }
                """;

        assertThat(parser.parseCreate(unknown).status())
                .isEqualTo(ProviderStatus.UNKNOWN);
        assertThat(parser.parseCreate(pending).status())
                .isEqualTo(ProviderStatus.PENDING);
    }

    @Test
    void parsesLookupByClientReference() throws Exception {
        String body = """
                {
                  "disbursements": {
                    "resource_type": "list",
                    "item_count": "1",
                    "data": {
                      "disbursement": [
                        {
                          "id": "dsb_lookup",
                          "status": "APPROVED"
                        }
                      ]
                    }
                  }
                }
                """;

        var result = parser.parseLookup(body);

        assertThat(result).isPresent();
        assertThat(result.orElseThrow().providerReference())
                .isEqualTo("dsb_lookup");
    }

    @Test
    void emptyLookupReturnsNoProviderRecord() throws Exception {
        String body = """
                {
                  "disbursements": {
                    "resource_type": "list",
                    "item_count": "0",
                    "data": {
                      "disbursement": []
                    }
                  }
                }
                """;

        assertThat(parser.parseLookup(body)).isEmpty();
    }
}
