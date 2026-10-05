package dev.yycodes.paymentsimulator.provider.visa;

import dev.yycodes.paymentsimulator.provider.ProviderResult;
import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import java.io.IOException;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class VisaDirectResponseParser {
    // Action codes meaning the issuer or the network could not answer, so the result is unknown.
    private static final Set<String> AMBIGUOUS = Set.of("68", "91", "96");

    private final JsonMapper mapper;

    public VisaDirectResponseParser(JsonMapper mapper) {
        this.mapper = mapper;
    }

    /** The reply to a push funds request. Action code 00 is an approval. */
    public ProviderResult parsePush(String body) throws IOException {
        JsonNode node = mapper.readTree(body);
        String action = node.path("actionCode").asText("");
        if (action.isBlank()) throw new IllegalArgumentException("No action code in response");
        String reference = node.path("transactionIdentifier").asText(null);
        return new ProviderResult(reference, statusOf(action));
    }

    /** The reply to a transaction query, or empty when Visa has no record. */
    public Optional<ProviderResult> parseQuery(String body, String transactionIdentifier)
            throws IOException {
        JsonNode node = mapper.readTree(body);
        if (!node.isArray()) {
            String message = node.path("errorMessage").asText("");
            if (message.toLowerCase(Locale.ROOT).contains("no transactions found"))
                return Optional.empty();
            throw new IllegalArgumentException("Unexpected query response");
        }
        ProviderResult found = null;
        for (JsonNode entry : node) {
            if (!transactionIdentifier.equals(entry.path("transactionIdentifier").asText()))
                continue;
            String action = entry.path("actionCode").asText("");
            String status = entry.path("statusCode").asText("");
            ProviderStatus mapped =
                    "PENDING".equalsIgnoreCase(status) ? ProviderStatus.PENDING : statusOf(action);
            found = new ProviderResult(transactionIdentifier, mapped);
            // The first approved record settles the question.
            if (mapped == ProviderStatus.SUCCEEDED) return Optional.of(found);
        }
        return Optional.ofNullable(found);
    }

    private static ProviderStatus statusOf(String action) {
        if ("00".equals(action)) return ProviderStatus.SUCCEEDED;
        if (AMBIGUOUS.contains(action)) return ProviderStatus.UNKNOWN;
        return ProviderStatus.DECLINED;
    }
}
