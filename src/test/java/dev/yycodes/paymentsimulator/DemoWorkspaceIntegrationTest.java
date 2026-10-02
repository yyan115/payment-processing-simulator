package dev.yycodes.paymentsimulator;

import static org.assertj.core.api.Assertions.*;

import dev.yycodes.paymentsimulator.demo.DemoWorkspace;
import dev.yycodes.paymentsimulator.demo.SandboxRequestBudget;
import dev.yycodes.paymentsimulator.provider.ProviderRejectedException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "payments.reconciliation.enabled=false", "payments.demo.enabled=true",
            "payments.demo.max-payouts=2", "payments.demo.cleanup-ms=3600000",
            "payments.demo.mastercard-calls-per-minute=2",
                    "payments.demo.mastercard-calls-per-day=3"
        })
class DemoWorkspaceIntegrationTest {
    @Value("${local.server.port}")
    int port;

    @Autowired JdbcTemplate jdbc;
    @Autowired DemoWorkspace workspaces;
    @Autowired SandboxRequestBudget budget;
    final HttpClient client = HttpClient.newHttpClient();
    final JsonMapper json = JsonMapper.builder().build();
    static final String INTENT =
            """
            {"recipientReference":"seller-one","amount":100,"currency":"SGD","provider":"simulated"}
            """;

    @BeforeEach
    void clean() {
        TestDatabaseCleaner.clean(jdbc);
    }

    HttpResponse<String> request(String method, String path, String cookie, String body, String key)
            throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (cookie != null) builder.header("Cookie", cookie);
        if (key != null) builder.header("Idempotency-Key", key);
        if (body != null) builder.header("Content-Type", "application/json");
        return client.send(
                builder.method(
                                method,
                                body == null
                                        ? HttpRequest.BodyPublishers.noBody()
                                        : HttpRequest.BodyPublishers.ofString(body))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
    }

    String workspace() throws Exception {
        var response = request("POST", "/api/v1/workspace", null, null, null);
        assertThat(response.statusCode()).isEqualTo(200);
        var header = response.headers().firstValue("set-cookie").orElseThrow();
        assertThat(header).contains("HttpOnly", "SameSite=Strict");
        return header.split(";", 2)[0];
    }

    String create(String cookie, String key) throws Exception {
        var response = request("POST", "/api/v1/payouts", cookie, INTENT, key);
        assertThat(response.statusCode()).isEqualTo(201);
        return json.readTree(response.body()).path("id").asText();
    }

    void process(String cookie, String id) throws Exception {
        assertThat(
                        request("POST", "/api/v1/payouts/" + id + "/process", cookie, null, null)
                                .statusCode())
                .isEqualTo(200);
    }

    @Test
    void workspacesScopeKeysListsAndEveryPayoutEndpoint() throws Exception {
        String a = workspace(), b = workspace();
        String id = create(a, "same-key"), other = create(b, "same-key");
        assertThat(id).isNotEqualTo(other);
        process(a, id);
        var replay = request("POST", "/api/v1/payouts", a, INTENT, "same-key");
        assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(json.readTree(replay.body()).path("id").asText()).isEqualTo(id);
        String list = request("GET", "/api/v1/payouts", b, null, null).body();
        assertThat(list).contains(other).doesNotContain(id);
        for (String suffix : List.of("", "/events", "/ledger", "/snapshot", "/provider"))
            assertThat(request("GET", "/api/v1/payouts/" + id + suffix, b, null, null).statusCode())
                    .as(suffix)
                    .isEqualTo(404);
        for (String suffix : List.of("/process", "/retry", "/reconcile"))
            assertThat(
                            request("POST", "/api/v1/payouts/" + id + suffix, b, null, null)
                                    .statusCode())
                    .as(suffix)
                    .isEqualTo(404);
        assertThat(
                        request(
                                        "PUT",
                                        "/api/v1/simulation/payouts/" + id + "/next-outcome",
                                        b,
                                        "{\"outcome\":\"DECLINED\"}",
                                        null)
                                .statusCode())
                .isEqualTo(404);
        assertThat(
                        request(
                                        "PUT",
                                        "/api/v1/simulation/payouts/" + id + "/provider-status",
                                        b,
                                        "{\"status\":\"DECLINED\"}",
                                        null)
                                .statusCode())
                .isEqualTo(404);
        assertThat(
                        request(
                                        "GET",
                                        "/api/v1/simulation/payouts/" + id + "/snapshot",
                                        b,
                                        null,
                                        null)
                                .statusCode())
                .isEqualTo(404);
        // URI encoding must not evade authorization after MVC decodes the resource ID.
        String encoded = "%" + Integer.toHexString(id.charAt(0)) + id.substring(1);
        assertThat(
                        request("POST", "/api/v1/payouts/" + encoded + "/process", b, null, null)
                                .statusCode())
                .isEqualTo(404);
        assertThat(
                        request("GET", "/api/v1/payouts/" + encoded + "/ledger", b, null, null)
                                .statusCode())
                .isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ledger_transactions", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void concurrentAdmissionCannotExceedWorkspaceLimit() throws Exception {
        String cookie = workspace();
        try (var pool = Executors.newFixedThreadPool(4)) {
            var start = new CountDownLatch(1);
            var futures = new ArrayList<Future<Integer>>();
            for (int n = 0; n < 4; n++) {
                String key = "concurrent-" + n;
                futures.add(
                        pool.submit(
                                () -> {
                                    start.await();
                                    return request("POST", "/api/v1/payouts", cookie, INTENT, key)
                                            .statusCode();
                                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (var future : futures) statuses.add(future.get(10, TimeUnit.SECONDS));
            assertThat(statuses).containsExactlyInAnyOrder(201, 201, 429, 429);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payouts", Integer.class)).isEqualTo(2);
    }

    @Test
    void activityKeepsTheSessionAliveAndTheCookieEndsWithTheBrowser() throws Exception {
        var opened = request("POST", "/api/v1/workspace", null, null, null);
        String header = opened.headers().firstValue("set-cookie").orElseThrow();
        assertThat(header).doesNotContainIgnoringCase("Max-Age").doesNotContainIgnoringCase("Expires");
        String cookie = header.split(";", 2)[0];
        UUID session = UUID.fromString(cookie.substring(cookie.indexOf('=') + 1));
        // A session close to its inactivity limit is extended by ordinary use.
        jdbc.update(
                "UPDATE demo_sessions SET expires_at=CURRENT_TIMESTAMP+INTERVAL '2 minutes' WHERE"
                    + " id=?",
                session);
        assertThat(request("GET", "/api/v1/payouts", cookie, null, null).statusCode())
                .isEqualTo(200);
        var expires =
                jdbc.queryForObject(
                        "SELECT expires_at FROM demo_sessions WHERE id=?",
                        java.sql.Timestamp.class,
                        session)
                        .toInstant();
        assertThat(expires).isAfter(java.time.Instant.now().plus(java.time.Duration.ofMinutes(20)));
        // The session keeps one identity however often it is extended.
        String first =
                json.readTree(request("POST", "/api/v1/workspace", cookie, null, null).body())
                        .path("startedAt")
                        .asText();
        String second =
                json.readTree(request("POST", "/api/v1/workspace", cookie, null, null).body())
                        .path("startedAt")
                        .asText();
        assertThat(first).isNotEmpty().isEqualTo(second);
    }

    @Test
    void expiryBlocksAccessAndCleanupRemovesOnlyExpiredDemoRecords() throws Exception {
        String expired = workspace(), active = workspace();
        String id = create(expired, "expired"), retained = create(active, "active");
        process(expired, id);
        process(active, retained);
        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "DELETE FROM ledger_entries WHERE transaction_id IN (SELECT"
                                            + " id FROM ledger_transactions WHERE payout_id=?)",
                                        UUID.fromString(id)))
                .isInstanceOf(DataAccessException.class);
        UUID session = UUID.fromString(expired.substring(expired.indexOf('=') + 1));
        jdbc.update(
                "UPDATE demo_sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '2 minutes' WHERE"
                    + " id=?",
                session);
        assertThat(request("GET", "/api/v1/payouts", expired, null, null).statusCode())
                .isEqualTo(410);
        workspaces.purgeExpired();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payouts", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ledger_transactions", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ledger_entries", Integer.class))
                .isEqualTo(2);
        assertThat(
                        request(
                                        "GET",
                                        "/api/v1/payouts/" + retained + "/ledger",
                                        active,
                                        null,
                                        null)
                                .statusCode())
                .isEqualTo(200);
        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "DELETE FROM payout_events WHERE payout_id=?",
                                        UUID.fromString(retained)))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void resetIssuesNewWorkspaceAndExpiresPreviousCookie() throws Exception {
        String original = workspace();
        create(original, "key");
        var response = request("POST", "/api/v1/workspace?reset=true", original, null, null);
        assertThat(response.statusCode()).isEqualTo(200);
        String fresh = response.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        assertThat(fresh).isNotEqualTo(original);
        assertThat(
                        json.readTree(request("GET", "/api/v1/payouts", fresh, null, null).body())
                                .path("total")
                                .asInt())
                .isZero();
        assertThat(request("GET", "/api/v1/payouts", original, null, null).statusCode())
                .isEqualTo(410);
    }

    @Test
    void unauthenticatedRequestsAndUnavailableProviderAreRejected() throws Exception {
        assertThat(request("GET", "/api/v1/payouts", null, null, null).statusCode()).isEqualTo(410);
        assertThat(request("GET", "/actuator/prometheus", null, null, null).statusCode())
                .isEqualTo(404);
        assertThat(request("GET", "/actuator/health", null, null, null).statusCode())
                .isEqualTo(200);
        var response =
                request(
                        "POST",
                        "/api/v1/payouts",
                        workspace(),
                        INTENT.replace("simulated", "mastercard"),
                        "key");
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payouts", Integer.class)).isZero();
    }

    @Test
    void sandboxLimitsAreAtomicAndPersistInDatabase() {
        budget.consume();
        budget.consume();
        assertThatThrownBy(budget::consume).isInstanceOf(ProviderRejectedException.class);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT requests FROM sandbox_call_budget WHERE window_key LIKE"
                                    + " 'day:%'",
                                Integer.class))
                .isEqualTo(2);
        jdbc.update("DELETE FROM sandbox_call_budget WHERE window_key LIKE 'minute:%'");
        budget.consume();
        assertThatThrownBy(budget::consume).isInstanceOf(ProviderRejectedException.class);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT requests FROM sandbox_call_budget WHERE window_key LIKE"
                                    + " 'day:%'",
                                Integer.class))
                .isEqualTo(3);
    }
}
