package dev.yycodes.paymentsimulator;

import static org.assertj.core.api.Assertions.*;

import dev.yycodes.paymentsimulator.demo.*;
import dev.yycodes.paymentsimulator.provider.ProviderRejectedException;
import java.net.*;
import java.net.http.*;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "payments.demo.enabled=true",
            "payments.reconciliation.enabled=false",
            "payments.demo.cleanup-ms=3600000",
            "payments.demo.turnstile-required=true",
            "payments.demo.turnstile-site-key=test-public",
            "payments.demo.turnstile-secret=test-private",
            "payments.demo.turnstile-hostname=demo.example"
        })
class SandboxProtectionIntegrationTest {
    @Value("${local.server.port}")
    int port;

    @Autowired JdbcTemplate jdbc;
    @Autowired SandboxVerification verification;
    @Autowired SandboxRequestBudget budget;
    final HttpClient client = HttpClient.newHttpClient();
    final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void clean() {
        TestDatabaseCleaner.clean(jdbc);
    }

    HttpResponse<String> request(String method, String path, String cookie, String body)
            throws Exception {
        var b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1" + path));
        if (cookie != null) b.header("Cookie", cookie);
        if (body != null) b.header("Content-Type", "application/json");
        b.header("Idempotency-Key", "one");
        return client.send(
                b.method(
                                method,
                                body == null
                                        ? HttpRequest.BodyPublishers.noBody()
                                        : HttpRequest.BodyPublishers.ofString(body))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void allExternalCallRoutesRejectUnverifiedSessionBeforeProcessing() throws Exception {
        var cookie =
                request("POST", "/workspace", null, null)
                        .headers()
                        .firstValue("set-cookie")
                        .orElseThrow()
                        .split(";")[0];
        var response =
                request(
                        "POST",
                        "/payouts",
                        cookie,
                        "{\"recipientReference\":\"John\",\"amount\":100,\"currency\":\"SGD\",\"provider\":\"simulated\"}");
        UUID id = UUID.fromString(json.readTree(response.body()).path("id").asText());
        jdbc.update("UPDATE payouts SET provider='mastercard' WHERE id=?", id);
        for (String route : new String[] {"process", "retry", "reconcile", "provider"})
            assertThat(
                            request(
                                            route.equals("provider") ? "GET" : "POST",
                                            "/payouts/" + id + "/" + route,
                                            cookie,
                                            null)
                                    .statusCode())
                    .isEqualTo(403);
        assertThat(jdbc.queryForObject("SELECT status FROM payouts WHERE id=?", String.class, id))
                .isEqualTo("CREATED");
        assertThatThrownBy(() -> budget.consume(id)).isInstanceOf(DemoException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sandbox_call_budget", Integer.class))
                .isZero();
        var state = request("GET", "/sandbox-verification", cookie, null);
        assertThat(state.body()).contains("test-public").doesNotContain("test-private");
        assertThat(
                        request("POST", "/sandbox-verification", cookie, "{\"token\":\"\"}")
                                .statusCode())
                .isEqualTo(400);
    }

    @Test
    void verifiedQuotaPersistsAndExpiresWithSession() throws Exception {
        var cookie =
                request("POST", "/workspace", null, null)
                        .headers()
                        .firstValue("set-cookie")
                        .orElseThrow()
                        .split(";")[0];
        var response =
                request(
                        "POST",
                        "/payouts",
                        cookie,
                        "{\"recipientReference\":\"John\",\"amount\":100,\"currency\":\"SGD\",\"provider\":\"simulated\"}");
        UUID id = UUID.fromString(json.readTree(response.body()).path("id").asText());
        jdbc.update("UPDATE demo_sessions SET sandbox_verified_until=expires_at");
        verification.authorize(id);
        budget.consume(id);
        assertThat(jdbc.queryForObject("SELECT sandbox_calls FROM demo_sessions", Integer.class))
                .isEqualTo(1);
        jdbc.update("UPDATE demo_sessions SET sandbox_calls=10");
        assertThatThrownBy(() -> budget.consume(id)).isInstanceOf(ProviderRejectedException.class);
        jdbc.update(
                "UPDATE demo_sessions SET sandbox_verified_until=CURRENT_TIMESTAMP-INTERVAL '1"
                        + " second'");
        assertThatThrownBy(() -> verification.authorize(id)).isInstanceOf(DemoException.class);
    }
}
