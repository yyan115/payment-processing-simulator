package dev.yycodes.paymentsimulator;

import static org.assertj.core.api.Assertions.assertThat;

import dev.yycodes.paymentsimulator.audit.PayoutEventRepository;
import dev.yycodes.paymentsimulator.ledger.LedgerEntryRepository;
import dev.yycodes.paymentsimulator.ledger.LedgerTransactionRepository;
import dev.yycodes.paymentsimulator.payout.PayoutRepository;
import dev.yycodes.paymentsimulator.provider.ProviderTransactionRepository;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationAttemptRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "payments.reconciliation.enabled=false")
class PayoutApiIntegrationTest {

    @Value("${local.server.port}")
    private int port;

    @Autowired private PayoutRepository payouts;
    @Autowired private ProviderTransactionRepository providerTransactions;
    @Autowired private PayoutEventRepository events;
    @Autowired private ReconciliationAttemptRepository reconciliationAttempts;
    @Autowired private LedgerTransactionRepository ledgerTransactions;
    @Autowired private LedgerEntryRepository ledgerEntries;
    @Autowired private JdbcTemplate jdbc;

    private final HttpClient client = HttpClient.newHttpClient();
    private final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void cleanDatabase() {
        TestDatabaseCleaner.clean(jdbc);
    }

    @Test
    void idempotentReplayReturnsOriginalPayout() throws Exception {
        String body =
                """
                {
                  "recipientReference": "seller-42",
                  "amount": 100.00,
                  "currency": "SGD"
                }
                """;

        HttpResponse<String> created = postPayout("api-idempotency", body);
        HttpResponse<String> replay = postPayout("api-idempotency", body);

        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(replay.statusCode()).isEqualTo(200);

        String createdId = json.readTree(created.body()).path("id").asText();
        String replayId = json.readTree(replay.body()).path("id").asText();

        assertThat(replayId).isEqualTo(createdId);
        assertThat(payouts.count()).isEqualTo(1);
    }

    @Test
    void idempotencyKeyReuseWithDifferentIntentReturnsConflict() throws Exception {
        postPayout(
                "api-conflict",
                """
                {
                  "recipientReference": "seller-42",
                  "amount": 100.00,
                  "currency": "SGD"
                }
                """);

        HttpResponse<String> conflict =
                postPayout(
                        "api-conflict",
                        """
                        {
                          "recipientReference": "seller-42",
                          "amount": 101.00,
                          "currency": "SGD"
                        }
                        """);

        assertThat(conflict.statusCode()).isEqualTo(409);
    }

    @Test
    void invalidMoneyPrecisionIsRejectedBeforePersistence() throws Exception {
        HttpResponse<String> response =
                postPayout(
                        "api-invalid-money",
                        """
                        {
                          "recipientReference": "seller-42",
                          "amount": 100.00001,
                          "currency": "SGD"
                        }
                        """);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void acceptsSmallestPositiveUnitForThreeDecimalCurrency() throws Exception {
        HttpResponse<String> response =
                postPayout(
                        "api-kwd-smallest-unit",
                        """
                        {
                          "recipientReference": "seller-42",
                          "amount": 0.001,
                          "currency": "KWD"
                        }
                        """);

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json.readTree(response.body()).path("amount").decimalValue())
                .isEqualByComparingTo("0.001");
        assertThat(payouts.count()).isEqualTo(1);
    }

    @Test
    void rejectsFractionalAmountForZeroDecimalCurrency() throws Exception {
        HttpResponse<String> response =
                postPayout(
                        "api-jpy-fraction",
                        """
                        {
                          "recipientReference": "seller-42",
                          "amount": 100.1,
                          "currency": "JPY"
                        }
                        """);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void rejectsZeroAndNegativeAmounts() throws Exception {
        HttpResponse<String> zero =
                postPayout(
                        "api-zero-amount",
                        """
                        {
                          "recipientReference": "seller-42",
                          "amount": 0,
                          "currency": "SGD"
                        }
                        """);

        HttpResponse<String> negative =
                postPayout(
                        "api-negative-amount",
                        """
                        {
                          "recipientReference": "seller-42",
                          "amount": -1,
                          "currency": "SGD"
                        }
                        """);

        assertThat(zero.statusCode()).isEqualTo(400);
        assertThat(negative.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void rejectsUnknownIsoCurrencyBeforePersistence() throws Exception {
        HttpResponse<String> response =
                postPayout(
                        "api-invalid-currency",
                        """
                        {
                          "recipientReference": "seller-42",
                          "amount": 100.00,
                          "currency": "AAA"
                        }
                        """);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void rejectsFractionalPrecisionNotSupportedByCurrency() throws Exception {
        HttpResponse<String> response =
                postPayout(
                        "api-invalid-sgd-precision",
                        """
                        {
                          "recipientReference": "seller-42",
                          "amount": 100.001,
                          "currency": "SGD"
                        }
                        """);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void missingIdempotencyKeyIsRejected() throws Exception {
        HttpRequest request =
                HttpRequest.newBuilder(api("/api/v1/payouts"))
                        .header("Content-Type", "application/json")
                        .POST(
                                HttpRequest.BodyPublishers.ofString(
                                        """
                                        {
                                          "recipientReference": "seller-42",
                                          "amount": 100.00,
                                          "currency": "SGD"
                                        }
                                        """))
                        .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void simulatorSnapshotShowsLostResponseAndExactlyOneRecoveredJournal() throws Exception {
        var created =
                postPayout(
                        "snapshot",
                        """
                        {"recipientReference":"seller-42","amount":100,"currency":"SGD"}
                        """);
        String id = json.readTree(created.body()).path("id").asText();
        assertThat(
                        send(
                                        "PUT",
                                        "/api/v1/simulation/payouts/" + id + "/next-outcome",
                                        "{\"outcome\":\"TIMEOUT_AFTER_SUCCESS\"}")
                                .statusCode())
                .isEqualTo(204);
        assertThat(send("POST", "/api/v1/payouts/" + id + "/process", "").statusCode())
                .isEqualTo(200);

        var uncertain =
                json.readTree(
                        send("GET", "/api/v1/simulation/payouts/" + id + "/snapshot", "").body());
        assertThat(uncertain.path("payout").path("status").asText()).isEqualTo("UNKNOWN");
        assertThat(uncertain.path("provider").path("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(uncertain.path("ledger").isNull()).isTrue();
        assertThat(uncertain.path("events").size()).isEqualTo(2);

        assertThat(send("POST", "/api/v1/payouts/" + id + "/reconcile", "").statusCode())
                .isEqualTo(200);
        var resolved =
                json.readTree(
                        send("GET", "/api/v1/simulation/payouts/" + id + "/snapshot", "").body());
        assertThat(resolved.path("payout").path("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(resolved.path("ledger").path("entries").size()).isEqualTo(2);
        assertThat(resolved.path("attempts").get(0).path("outcome").asText())
                .isEqualTo("RESOLVED_SUCCEEDED");
        assertThat(send("POST", "/api/v1/payouts/" + id + "/retry", "").statusCode())
                .isEqualTo(409);
        assertThat(ledgerTransactions.count()).isEqualTo(1);
        assertThat(providerTransactions.count()).isEqualTo(1);
    }

    @Test
    void longestValidRecipientCanBePostedToLedger() throws Exception {
        var created =
                postPayout(
                        "long-recipient",
                        "{\"recipientReference\":\""
                                + "r".repeat(255)
                                + "\",\"amount\":100,\"currency\":\"SGD\"}");
        assertThat(created.statusCode()).isEqualTo(201);
        String id = json.readTree(created.body()).path("id").asText();
        var processed = send("POST", "/api/v1/payouts/" + id + "/process", "");
        assertThat(processed.statusCode()).isEqualTo(200);
        assertThat(json.readTree(processed.body()).path("status").asText()).isEqualTo("SUCCEEDED");
        assertThat(ledgerEntries.count()).isEqualTo(2);
    }

    @Test
    void payoutBrowsingIsPaginatedAndValidatesBounds() throws Exception {
        postPayout(
                "list-one", "{\"recipientReference\":\"one\",\"amount\":1,\"currency\":\"SGD\"}");
        postPayout(
                "list-two", "{\"recipientReference\":\"two\",\"amount\":2,\"currency\":\"SGD\"}");
        var first = json.readTree(send("GET", "/api/v1/payouts?size=1", "").body());
        var second = json.readTree(send("GET", "/api/v1/payouts?size=1&page=1", "").body());
        assertThat(first.path("total").asLong()).isEqualTo(2);
        assertThat(first.path("items").size()).isEqualTo(1);
        assertThat(first.path("items").get(0).path("id").asText())
                .isNotEqualTo(second.path("items").get(0).path("id").asText());
        assertThat(send("GET", "/api/v1/payouts?size=101", "").statusCode()).isEqualTo(400);
        assertThat(send("GET", "/api/v1/payouts?page=-1", "").statusCode()).isEqualTo(400);
        assertThat(
                        send(
                                        "GET",
                                        "/api/v1/simulation/payouts/00000000-0000-0000-0000-000000000000/snapshot",
                                        "")
                                .statusCode())
                .isEqualTo(404);
    }

    private HttpResponse<String> send(String method, String path, String body) throws Exception {
        return client.send(
                HttpRequest.newBuilder(api(path))
                        .header("Content-Type", "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofString(body))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> postPayout(String idempotencyKey, String body) throws Exception {
        HttpRequest request =
                HttpRequest.newBuilder(api("/api/v1/payouts"))
                        .header("Content-Type", "application/json")
                        .header("Idempotency-Key", idempotencyKey)
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .build();

        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private URI api(String path) {
        return URI.create("http://localhost:" + port + path);
    }
}
