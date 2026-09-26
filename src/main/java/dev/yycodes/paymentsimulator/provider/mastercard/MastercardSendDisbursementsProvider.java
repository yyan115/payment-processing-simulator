package dev.yycodes.paymentsimulator.provider.mastercard;

import com.mastercard.developer.oauth.OAuth;
import com.mastercard.developer.utils.AuthenticationUtils;
import dev.yycodes.paymentsimulator.provider.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

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

    private final JsonMapper mapper;
    private final MastercardSendResponseParser parser;
    private final HttpClient httpClient;
    private final URI baseUrl;
    private final String partnerId;
    private final String consumerKey;
    private final String senderAccountUri;
    private final String recipientAccountUri;
    private final PrivateKey signingKey;

    public MastercardSendDisbursementsProvider(
            JsonMapper mapper,
            MastercardSendResponseParser parser,
            @Value("${payments.mastercard.base-url}") String baseUrl,
            @Value("${payments.mastercard.partner-id}") String partnerId,
            @Value("${payments.mastercard.consumer-key}") String consumerKey,
            @Value("${payments.mastercard.p12-path}") String p12Path,
            @Value("${payments.mastercard.key-alias}") String keyAlias,
            @Value("${payments.mastercard.key-password}") String keyPassword,
            @Value("${payments.mastercard.sender-account-uri}") String senderAccountUri,
            @Value("${payments.mastercard.recipient-account-uri}") String recipientAccountUri
    ) throws Exception {
        requireConfigured("payments.mastercard.partner-id", partnerId);
        requireConfigured("payments.mastercard.consumer-key", consumerKey);
        requireConfigured("payments.mastercard.p12-path", p12Path);

        this.mapper = mapper;
        this.parser = parser;
        this.baseUrl = URI.create(baseUrl);
        this.partnerId = partnerId;
        this.consumerKey = consumerKey;
        this.senderAccountUri = senderAccountUri;
        this.recipientAccountUri = recipientAccountUri;
        this.signingKey = AuthenticationUtils.loadSigningKey(
                p12Path,
                keyAlias,
                keyPassword
        );
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
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

        String payload;
        try {
            payload = mapper.writeValueAsString(buildRequest(
                    clientReference,
                    amount,
                    currency
            ));
        } catch (IOException serializationFailure) {
            throw new IllegalStateException(
                    "Could not serialize Mastercard Send request",
                    serializationFailure
            );
        }

        HttpRequest request = signedRequest(
                uri,
                "POST",
                payload,
                HttpRequest.BodyPublishers.ofString(payload)
        ).header("repeat-flag", mode == SubmissionMode.RETRY ? "true" : "false")
                .build();

        String body = execute(request);

        try {
            return parser.parseCreate(body);
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

        String body = execute(request);

        try {
            return parser.parseLookup(body);
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

    private String execute(HttpRequest request) {
        try {
            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() >= 500 || response.statusCode() == 408) {
                throw new ProviderTimeoutException(
                        "Mastercard Send request had an ambiguous server/transport result");
            }

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException(
                        "Mastercard Send rejected request with HTTP " + response.statusCode());
            }

            return response.body();
        } catch (IOException ioFailure) {
            throw new ProviderTimeoutException(
                    "Mastercard Send network request failed");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ProviderTimeoutException(
                    "Mastercard Send request was interrupted");
        }
    }

    private ObjectNode buildRequest(
            UUID clientReference,
            BigDecimal amount,
            String currency) {

        ObjectNode payment = mapper.createObjectNode();
        payment.put("disbursement_reference", clientReference.toString());
        payment.put("amount", amount.toPlainString());
        payment.put("currency", currency);
        payment.put("payment_type", "BDB");
        payment.put("sender_account_uri", senderAccountUri);
        payment.put("recipient_account_uri", recipientAccountUri);
        payment.put("funding_source", "DEPOSIT_ACCOUNT");
        payment.put("payment_origination_country", "USA");

        ObjectNode sender = payment.putObject("sender");
        sender.put("first_name", "Sandbox");
        sender.put("last_name", "Business");
        ObjectNode senderAddress = sender.putObject("address");
        senderAddress.put("line1", "123 Corporate Drive");
        senderAddress.put("city", "Chicago");
        senderAddress.put("country_subdivision", "IL");
        senderAddress.put("postal_code", "60618");
        senderAddress.put("country", "USA");

        ObjectNode recipient = payment.putObject("recipient");
        recipient.put("first_name", "Sandbox");
        recipient.put("last_name", "Recipient");
        ObjectNode recipientAddress = recipient.putObject("address");
        recipientAddress.put("line1", "1 Main St");
        recipientAddress.put("city", "OFallon");
        recipientAddress.put("country_subdivision", "MO");
        recipientAddress.put("postal_code", "63368");
        recipientAddress.put("country", "USA");

        ObjectNode participant = payment.putObject("participant");
        participant.put("merchant_category_code", "4121");
        participant.put("card_acceptor_id", "PaymentSimulator");
        participant.put("customer_service_contact_info", "18005559999");

        ObjectNode wrapper = mapper.createObjectNode();
        wrapper.set("payment_disbursement", payment);
        return wrapper;
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
}
