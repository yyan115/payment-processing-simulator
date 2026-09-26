package dev.yycodes.paymentsimulator.provider.mastercard;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import dev.yycodes.paymentsimulator.provider.ProviderStatus;
import dev.yycodes.paymentsimulator.provider.SubmissionMode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class MastercardSendProviderContractTest {

    private HttpServer server;
    private URI baseUrl;
    private final AtomicReference<String> method = new AtomicReference<>();
    private final AtomicReference<String> pathAndQuery = new AtomicReference<>();
    private final AtomicReference<String> repeatFlag = new AtomicReference<>();
    private final AtomicReference<String> authorization = new AtomicReference<>();
    private final AtomicReference<String> requestBody = new AtomicReference<>();

    @BeforeEach
    void startServer() throws Exception {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", this::handle);
        server.start();
        baseUrl = URI.create("http://localhost:" + server.getAddress().getPort());
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void originalSubmissionUsesPublishedPathSignedRequestAndRepeatFlagFalse() throws Exception {
        UUID reference = UUID.fromString("1d23a2a2-c94b-4ab5-9549-44208fc95348");
        var provider = provider();

        var result = provider.submit(
                reference,
                new BigDecimal("100.00"),
                "SGD",
                SubmissionMode.ORIGINAL
        );

        assertThat(result.status()).isEqualTo(ProviderStatus.SUCCEEDED);
        assertThat(result.providerReference()).isEqualTo("dsb_contract");
        assertThat(method.get()).isEqualTo("POST");
        assertThat(pathAndQuery.get())
                .isEqualTo("/send/static/v1/partners/partner-test/disbursements/payment");
        assertThat(repeatFlag.get()).isEqualTo("false");
        assertThat(authorization.get()).startsWith("OAuth ");

        var payment = JsonMapper.builder().build()
                .readTree(requestBody.get())
                .path("payment_disbursement");

        assertThat(payment.path("disbursement_reference").asText())
                .isEqualTo(reference.toString());
        assertThat(payment.path("transaction_local_date_time").asText())
                .isEqualTo("2026-09-26T22:00:00+00:00");
    }

    @Test
    void repeatedSubmissionSetsRepeatFlagTrue() throws Exception {
        provider().submit(
                UUID.randomUUID(),
                new BigDecimal("25.00"),
                "SGD",
                SubmissionMode.RETRY
        );

        assertThat(repeatFlag.get()).isEqualTo("true");
    }

    @Test
    void reconciliationLooksUpByClientReference() throws Exception {
        UUID reference = UUID.fromString("40cf1675-e45b-444c-86f3-7d73e646f1fb");

        var result = provider().findByClientReference(reference);

        assertThat(result).isPresent();
        assertThat(result.orElseThrow().status())
                .isEqualTo(ProviderStatus.SUCCEEDED);
        assertThat(method.get()).isEqualTo("GET");
        assertThat(pathAndQuery.get())
                .isEqualTo(
                        "/send/v1/partners/partner-test/disbursements?ref="
                                + reference
                );
        assertThat(authorization.get()).startsWith("OAuth ");
    }

    private MastercardSendDisbursementsProvider provider() throws Exception {
        JsonMapper mapper = JsonMapper.builder().build();
        MastercardSendRequestFactory factory = new MastercardSendRequestFactory(
                mapper,
                "raw:sender",
                "pan:recipient;exp=2077-05",
                Clock.fixed(
                        Instant.parse("2026-09-26T22:00:00Z"),
                        ZoneOffset.UTC
                )
        );

        KeyPairGenerator keys = KeyPairGenerator.getInstance("RSA");
        keys.initialize(2048);

        return new MastercardSendDisbursementsProvider(
                factory,
                new MastercardSendResponseParser(mapper),
                HttpClient.newHttpClient(),
                baseUrl,
                "partner-test",
                "consumer-test",
                keys.generateKeyPair().getPrivate()
        );
    }

    private void handle(HttpExchange exchange) {
        try {
            method.set(exchange.getRequestMethod());
            String query = exchange.getRequestURI().getRawQuery();
            pathAndQuery.set(
                    exchange.getRequestURI().getRawPath()
                            + (query == null ? "" : "?" + query)
            );
            repeatFlag.set(exchange.getRequestHeaders().getFirst("repeat-flag"));
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            requestBody.set(new String(
                    exchange.getRequestBody().readAllBytes(),
                    StandardCharsets.UTF_8
            ));

            String response;
            if ("GET".equals(exchange.getRequestMethod())) {
                response = """
                        {
                          "disbursements": {
                            "data": {
                              "disbursement": [
                                {
                                  "id": "dsb_contract",
                                  "status": "APPROVED"
                                }
                              ]
                            }
                          }
                        }
                        """;
            } else {
                response = """
                        {
                          "disbursement": {
                            "id": "dsb_contract",
                            "status": "APPROVED"
                          }
                        }
                        """;
            }

            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        } catch (Exception failure) {
            throw new RuntimeException(failure);
        }
    }
}
