package dev.yycodes.paymentsimulator.provider.mastercard;

import dev.yycodes.paymentsimulator.provider.ProviderResult;
import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.Optional;

@Component
public class MastercardSendResponseParser {

    private final JsonMapper mapper;

    public MastercardSendResponseParser(JsonMapper mapper) {
        this.mapper = mapper;
    }

    public ProviderResult parseCreate(String body) throws IOException {
        JsonNode disbursement = mapper.readTree(body).path("disbursement");
        return parseDisbursement(disbursement);
    }

    public Optional<ProviderResult> parseLookup(String body) throws IOException {
        JsonNode list = mapper.readTree(body)
                .path("disbursements")
                .path("data")
                .path("disbursement");

        if (!list.isArray() || list.isEmpty()) {
            return Optional.empty();
        }

        return Optional.of(parseDisbursement(list.get(0)));
    }

    ProviderResult parseDisbursement(JsonNode disbursement) {
        String id = requiredText(disbursement, "id");
        String status = requiredText(disbursement, "status");

        return new ProviderResult(id, mapStatus(status));
    }

    static ProviderStatus mapStatus(String status) {
        return switch (status.toUpperCase()) {
            case "APPROVED" -> ProviderStatus.SUCCEEDED;
            case "DECLINED", "REVERSED" -> ProviderStatus.DECLINED;
            case "PENDING" -> ProviderStatus.PENDING;
            case "UNKNOWN", "ERROR" -> ProviderStatus.UNKNOWN;
            default -> throw new IllegalArgumentException(
                    "Unsupported Mastercard Send status: " + status);
        };
    }

    private static String requiredText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException(
                    "Mastercard Send response is missing " + field);
        }
        return value.asText();
    }
}
