package dev.yycodes.paymentsimulator.provider.visa;

import dev.yycodes.paymentsimulator.demo.SandboxRequestBudget;
import dev.yycodes.paymentsimulator.provider.*;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Visa Direct payouts through the push funds API (an Original Credit Transaction). Requests use
 * two-way SSL and a user ID and password, and their bodies are encrypted with Message Level
 * Encryption.
 */
@Service
@ConditionalOnExpression(
        "${payments.visa.enabled:false} or '${payments.provider:simulated}' == 'visa'")
public class VisaDirectProvider implements PaymentProvider {

    private final VisaDirectPayloadFactory payloads;
    private final VisaDirectResponseParser parser;
    private final VisaMessageEncryption encryption;
    private final JsonMapper mapper;
    private final HttpClient httpClient;
    private final URI baseUrl;
    private final String authorization;
    private final String keyId;
    private final Clock clock;

    @Autowired(required = false)
    private SandboxRequestBudget demoBudget;

    @Autowired
    public VisaDirectProvider(
            VisaDirectPayloadFactory payloads,
            VisaDirectResponseParser parser,
            JsonMapper mapper,
            @Value("${payments.visa.base-url}") String baseUrl,
            @Value("${payments.visa.user-id}") String userId,
            @Value("${payments.visa.password}") String password,
            @Value("${payments.visa.client-cert-base64}") String clientCert,
            @Value("${payments.visa.client-key-base64}") String clientKey,
            @Value("${payments.visa.mle-key-id}") String keyId,
            @Value("${payments.visa.mle-server-cert-base64}") String mleServerCert,
            @Value("${payments.visa.mle-private-key-base64}") String mlePrivateKey)
            throws Exception {
        this(
                payloads,
                parser,
                mapper,
                URI.create(baseUrl),
                requireConfigured("payments.visa.user-id", userId),
                requireConfigured("payments.visa.password", password),
                requireConfigured("payments.visa.mle-key-id", keyId),
                new VisaMessageEncryption(
                        VisaKeys.certificate(
                                        VisaKeys.pem(
                                                requireConfigured(
                                                        "payments.visa.mle-server-cert-base64",
                                                        mleServerCert)))
                                .getPublicKey(),
                        VisaKeys.privateKey(
                                VisaKeys.pem(
                                        requireConfigured(
                                                "payments.visa.mle-private-key-base64",
                                                mlePrivateKey))),
                        keyId),
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(5))
                        .sslContext(
                                VisaKeys.twoWaySsl(
                                        VisaKeys.privateKey(
                                                VisaKeys.pem(
                                                        requireConfigured(
                                                                "payments.visa.client-key-base64",
                                                                clientKey))),
                                        VisaKeys.certificate(
                                                VisaKeys.pem(
                                                        requireConfigured(
                                                                "payments.visa.client-cert-base64",
                                                                clientCert)))))
                        .build(),
                Clock.systemUTC());
        requireSandboxBaseUrl(this.baseUrl);
    }

    VisaDirectProvider(
            VisaDirectPayloadFactory payloads,
            VisaDirectResponseParser parser,
            JsonMapper mapper,
            URI baseUrl,
            String userId,
            String password,
            String keyId,
            VisaMessageEncryption encryption,
            HttpClient httpClient,
            Clock clock) {
        this.payloads = payloads;
        this.parser = parser;
        this.mapper = mapper;
        this.baseUrl = baseUrl;
        this.authorization =
                "Basic "
                        + Base64.getEncoder()
                                .encodeToString(
                                        (userId + ":" + password).getBytes(StandardCharsets.UTF_8));
        this.keyId = keyId;
        this.encryption = encryption;
        this.httpClient = httpClient;
        this.clock = clock;
    }

    @Override
    public ProviderResult submit(
            UUID clientReference, BigDecimal amount, String currency, SubmissionMode mode) {
        try {
            String payload =
                    payloads.createPayload(clientReference, amount, currency, clock.instant());
            String body = "{\"encData\":\"" + encryption.encrypt(payload) + "\"}";
            HttpRequest request =
                    request("/visadirect/fundstransfer/v1/pushfundstransactions")
                            .POST(HttpRequest.BodyPublishers.ofString(body))
                            .build();
            Response response = execute(request, clientReference);
            if (response.status() >= 400)
                throw new ProviderRejectedException(
                        response.status(),
                        "Visa Direct rejected the request with HTTP "
                                + response.status()
                                + errorDetail(response.body()));
            try {
                return parser.parsePush(readable(response.body()));
            } catch (IOException | IllegalArgumentException invalidResponse) {
                throw new ProviderTimeoutException(
                        "Visa Direct returned an unreadable transaction response", invalidResponse);
            }
        } catch (ProviderRejectedException
                | ProviderTimeoutException
                | ProviderRequestException known) {
            throw known;
        } catch (Exception failure) {
            throw new ProviderTimeoutException(
                    "Visa Direct request could not be completed", failure);
        }
    }

    @Override
    public Optional<ProviderResult> findByClientReference(UUID clientReference) {
        String identifier = VisaDirectPayloadFactory.transactionIdentifier(clientReference);
        String path =
                "/visadirect/v1/transactionquery?acquiringBIN="
                        + URLEncoder.encode(payloads.acquiringBin(), StandardCharsets.UTF_8)
                        + "&transactionIdentifier="
                        + identifier;
        Response response = execute(request(path).GET().build(), clientReference);
        if (response.status() == 404) return Optional.empty();
        if (response.status() >= 400)
            throw new ProviderRejectedException(
                    response.status(),
                    "Visa Direct rejected the query with HTTP " + response.status());
        try {
            return parser.parseQuery(readable(response.body()), identifier);
        } catch (Exception invalidResponse) {
            throw new ProviderTimeoutException(
                    "Visa Direct returned an unreadable reconciliation response", invalidResponse);
        }
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(baseUrl.resolve(path))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", authorization)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("keyId", keyId);
    }

    private Response execute(HttpRequest request, UUID clientReference) {
        if (demoBudget != null) demoBudget.consume(clientReference);
        try {
            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 500 || response.statusCode() == 408)
                throw new ProviderTimeoutException(
                        "Visa Direct request had an ambiguous server/transport result");
            return new Response(response.statusCode(), response.body());
        } catch (IOException ioFailure) {
            throw new ProviderTimeoutException("Visa Direct network request failed", ioFailure);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ProviderTimeoutException("Visa Direct request was interrupted", interrupted);
        }
    }

    // A reply is either plain JSON or an object with an "encData" field that holds a JWE.
    private String readable(String body) throws Exception {
        JsonNode node = mapper.readTree(body);
        JsonNode sealed = node.path("encData");
        return sealed.isTextual() ? encryption.decrypt(sealed.asText()) : body;
    }

    private String errorDetail(String body) {
        try {
            JsonNode node = mapper.readTree(readable(body));
            String message = node.path("errorMessage").asText("");
            if (message.isBlank()) message = node.path("responseStatus").path("message").asText("");
            return message.isBlank() ? "" : ": " + message;
        } catch (Exception unreadable) {
            return "";
        }
    }

    static void requireSandboxBaseUrl(URI baseUrl) {
        boolean allowed = "sandbox.api.visa.com".equalsIgnoreCase(baseUrl.getHost());
        if (!"https".equalsIgnoreCase(baseUrl.getScheme()) || !allowed)
            throw new IllegalStateException("Only the Visa sandbox endpoint is supported");
    }

    private static String requireConfigured(String property, String value) {
        if (value == null || value.isBlank())
            throw new IllegalStateException(
                    property + " must be configured when the Visa provider is enabled");
        return value;
    }

    private record Response(int status, String body) {}
}
