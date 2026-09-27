package dev.yycodes.paymentsimulator.provider.mastercard;

import com.mastercard.developer.oauth.OAuth;
import com.mastercard.developer.utils.AuthenticationUtils;
import dev.yycodes.paymentsimulator.provider.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.PrivateKey;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

@Service
@ConditionalOnProperty(name = "payments.provider", havingValue = "mastercard")
public class MastercardSendDisbursementsProvider implements PaymentProvider {

    private final MastercardSendRequestFactory requestFactory;
    private final MastercardSendResponseParser parser;
    private final HttpClient httpClient;
    private final URI baseUrl;
    private final String partnerId;
    private final String consumerKey;
    private final PrivateKey signingKey;

    public MastercardSendDisbursementsProvider(
            MastercardSendRequestFactory requestFactory,
            MastercardSendResponseParser parser,
            @Value("${payments.mastercard.base-url}") String baseUrl,
            @Value("${payments.mastercard.partner-id}") String partnerId,
            @Value("${payments.mastercard.consumer-key}") String consumerKey,
            @Value("${payments.mastercard.p12-path}") String p12Path,
            @Value("${payments.mastercard.key-alias}") String keyAlias,
            @Value("${payments.mastercard.key-password}") String keyPassword
    ) throws Exception {
        this(
                requestFactory,
                parser,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(5))
                        .build(),
                URI.create(baseUrl),
                partnerId,
                consumerKey,
                loadSigningKey(p12Path, keyAlias, keyPassword)
        );
        requireSandboxBaseUrl(this.baseUrl);
    }

    MastercardSendDisbursementsProvider(
            MastercardSendRequestFactory requestFactory,
            MastercardSendResponseParser parser,
            HttpClient httpClient,
            URI baseUrl,
            String partnerId,
            String consumerKey,
            PrivateKey signingKey) {
        requireConfigured("payments.mastercard.partner-id", partnerId);
        requireConfigured("payments.mastercard.consumer-key", consumerKey);

        this.requestFactory = requestFactory;
        this.parser = parser;
        this.httpClient = httpClient;
        this.baseUrl = baseUrl;
        this.partnerId = partnerId;
        this.consumerKey = consumerKey;
        this.signingKey = signingKey;
    }

    @Override
    public ProviderResult submit(
            UUID clientReference,
            BigDecimal amount,
            String currency,
            SubmissionMode mode) {

        URI uri = baseUrl.resolve(
                "/send/static/v1/partners/"
                        + encodePath(partnerId)
                        + "/disbursements/payment"
        );

        String payload = requestFactory.createPayload(
                clientReference,
                amount,
                currency
        );

        HttpRequest request = signedRequest(
                uri,
                "POST",
                payload,
                HttpRequest.BodyPublishers.ofString(payload)
        ).header(
                "repeat-flag",
                mode == SubmissionMode.RETRY ? "true" : "false"
        ).build();

        ProviderHttpResponse response = execute(request);

        if (response.statusCode() == 402) {
            try {
                if (parser.isLegacyDeclineError(response.body())) {
                    return new ProviderResult(null, ProviderStatus.DECLINED);
                }
            } catch (IOException invalidErrorBody) {
                throw new ProviderRejectedException(
                        response.statusCode(),
                        "Mastercard Send returned an unreadable decline response"
                );
            }
        }

        requireSuccess(response);

        try {
            return parser.parseCreate(response.body());
        } catch (IOException | IllegalArgumentException invalidResponse) {
            throw new ProviderTimeoutException(
                    "Mastercard Send returned an unreadable transaction response");
        }
    }

    @Override
    public Optional<ProviderResult> findByClientReference(UUID clientReference) {
        String ref = URLEncoder.encode(
                clientReference.toString(),
                StandardCharsets.UTF_8
        );

        URI uri = baseUrl.resolve(
                "/send/v1/partners/"
                        + encodePath(partnerId)
                        + "/disbursements?ref="
                        + ref
        );

        HttpRequest request = signedRequest(
                uri,
                "GET",
                "",
                HttpRequest.BodyPublishers.noBody()
        ).build();

        ProviderHttpResponse response = execute(request);

        if (response.statusCode() == 404) {
            return Optional.empty();
        }

        requireSuccess(response);

        try {
            return parser.parseLookup(response.body());
        } catch (IOException | IllegalArgumentException invalidResponse) {
            throw new ProviderTimeoutException(
                    "Mastercard Send returned an unreadable reconciliation response");
        }
    }

    private HttpRequest.Builder signedRequest(
            URI uri,
            String method,
            String payload,
            HttpRequest.BodyPublisher body) {

        String authorization = OAuth.getAuthorizationHeader(
                uri,
                method,
                payload,
                StandardCharsets.UTF_8,
                consumerKey,
                signingKey
        );

        return HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", authorization)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json; charset=UTF-8")
                .method(method, body);
    }

    private ProviderHttpResponse execute(HttpRequest request) {
        try {
            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() >= 500 || response.statusCode() == 408) {
                throw new ProviderTimeoutException(
                        "Mastercard Send request had an ambiguous server/transport result");
            }

            return new ProviderHttpResponse(
                    response.statusCode(),
                    response.body()
            );
        } catch (IOException ioFailure) {
            throw new ProviderTimeoutException(
                    "Mastercard Send network request failed");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ProviderTimeoutException(
                    "Mastercard Send request was interrupted");
        }
    }

    private static void requireSuccess(ProviderHttpResponse response) {
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new ProviderRejectedException(
                    response.statusCode(),
                    "Mastercard Send rejected request with HTTP "
                            + response.statusCode()
            );
        }
    }

    private static PrivateKey loadSigningKey(
            String p12Path,
            String keyAlias,
            String keyPassword) throws Exception {
        requireConfigured("payments.mastercard.p12-path", p12Path);
        return AuthenticationUtils.loadSigningKey(
                p12Path,
                keyAlias,
                keyPassword
        );
    }

    static void requireSandboxBaseUrl(URI baseUrl) {
        String host = baseUrl.getHost();
        boolean allowed = "sandbox.api.move.mastercard.com".equalsIgnoreCase(host)
                || "sandbox.api.mastercard.com".equalsIgnoreCase(host);

        if (!"https".equalsIgnoreCase(baseUrl.getScheme()) || !allowed) {
            throw new IllegalStateException(
                    "This project intentionally supports Mastercard sandbox endpoints only");
        }
    }

    private static String encodePath(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
                .replace("+", "%20");
    }

    private static void requireConfigured(String property, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    property + " must be configured when PAYMENTS_PROVIDER=mastercard");
        }
    }

    private record ProviderHttpResponse(int statusCode, String body) {
    }
}
