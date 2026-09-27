package dev.yycodes.paymentsimulator;

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

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "payments.reconciliation.enabled=false"
)
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
        String body = """
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
                """
        );

        HttpResponse<String> conflict = postPayout(
                "api-conflict",
                """
                {
                  "recipientReference": "seller-42",
                  "amount": 101.00,
                  "currency": "SGD"
                }
                """
        );

        assertThat(conflict.statusCode()).isEqualTo(409);
    }

    @Test
    void invalidMoneyPrecisionIsRejectedBeforePersistence() throws Exception {
        HttpResponse<String> response = postPayout(
                "api-invalid-money",
                """
                {
                  "recipientReference": "seller-42",
                  "amount": 100.00001,
                  "currency": "SGD"
                }
                """
        );

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void acceptsSmallestPositiveUnitForThreeDecimalCurrency() throws Exception {
        HttpResponse<String> response = postPayout(
                "api-kwd-smallest-unit",
                """
                {
                  "recipientReference": "seller-42",
                  "amount": 0.001,
                  "currency": "KWD"
                }
                """
        );

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json.readTree(response.body()).path("amount").decimalValue())
                .isEqualByComparingTo("0.001");
        assertThat(payouts.count()).isEqualTo(1);
    }

    @Test
    void rejectsFractionalAmountForZeroDecimalCurrency() throws Exception {
        HttpResponse<String> response = postPayout(
                "api-jpy-fraction",
                """
                {
                  "recipientReference": "seller-42",
                  "amount": 100.1,
                  "currency": "JPY"
                }
                """
        );

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void rejectsZeroAndNegativeAmounts() throws Exception {
        HttpResponse<String> zero = postPayout(
                "api-zero-amount",
                """
                {
                  "recipientReference": "seller-42",
                  "amount": 0,
                  "currency": "SGD"
                }
                """
        );

        HttpResponse<String> negative = postPayout(
                "api-negative-amount",
                """
                {
                  "recipientReference": "seller-42",
                  "amount": -1,
                  "currency": "SGD"
                }
                """
        );

        assertThat(zero.statusCode()).isEqualTo(400);
        assertThat(negative.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void rejectsUnknownIsoCurrencyBeforePersistence() throws Exception {
        HttpResponse<String> response = postPayout(
                "api-invalid-currency",
                """
                {
                  "recipientReference": "seller-42",
                  "amount": 100.00,
                  "currency": "AAA"
                }
                """
        );

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void rejectsFractionalPrecisionNotSupportedByCurrency() throws Exception {
        HttpResponse<String> response = postPayout(
                "api-invalid-sgd-precision",
                """
                {
                  "recipientReference": "seller-42",
                  "amount": 100.001,
                  "currency": "SGD"
                }
                """
        );

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    @Test
    void missingIdempotencyKeyIsRejected() throws Exception {
        HttpRequest request = HttpRequest.newBuilder(api("/api/v1/payouts"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""
                        {
                          "recipientReference": "seller-42",
                          "amount": 100.00,
                          "currency": "SGD"
                        }
                        """))
                .build();

        HttpResponse<String> response = client.send(
                request,
                HttpResponse.BodyHandlers.ofString()
        );

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(payouts.count()).isZero();
    }

    private HttpResponse<String> postPayout(String idempotencyKey, String body)
            throws Exception {
        HttpRequest request = HttpRequest.newBuilder(api("/api/v1/payouts"))
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
