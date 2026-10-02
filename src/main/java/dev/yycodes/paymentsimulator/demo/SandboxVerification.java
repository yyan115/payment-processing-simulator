package dev.yycodes.paymentsimulator.demo;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

@Service
public class SandboxVerification {
    private final JdbcTemplate jdbc;
    private final DemoWorkspace workspace;
    private final String siteKey, secret, hostname;
    private final boolean required;
    private final HttpClient client =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    public SandboxVerification(
            JdbcTemplate jdbc,
            DemoWorkspace workspace,
            @Value("${payments.demo.turnstile-required:false}") boolean required,
            @Value("${payments.demo.turnstile-site-key:}") String siteKey,
            @Value("${payments.demo.turnstile-secret:}") String secret,
            @Value("${payments.demo.turnstile-hostname:}") String hostname) {
        this.jdbc = jdbc;
        this.workspace = workspace;
        this.required = required;
        this.siteKey = siteKey;
        this.secret = secret;
        this.hostname = hostname;
        if (required && (siteKey.isBlank() || secret.isBlank() || hostname.isBlank()))
            throw new IllegalArgumentException(
                    "Turnstile requires a site key, secret and expected hostname");
    }

    public boolean required() {
        return workspace.enabled() && required;
    }

    public String siteKey() {
        return required() ? siteKey : "";
    }

    public boolean verified() {
        if (!required()) return true;
        return verified(workspace.currentId());
    }

    private boolean verified(UUID session) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "SELECT sandbox_verified_until>CURRENT_TIMESTAMP AND"
                            + " expires_at>CURRENT_TIMESTAMP FROM demo_sessions WHERE id=?",
                        Boolean.class,
                        session));
    }

    public void verify(String token) {
        if (!required()) return;
        UUID session = workspace.currentId();
        if (token == null || token.isBlank() || token.length() > 2048)
            throw new DemoException(400, "Complete the verification check.");
        try {
            String body =
                    "secret="
                            + URLEncoder.encode(secret, StandardCharsets.UTF_8)
                            + "&response="
                            + URLEncoder.encode(token, StandardCharsets.UTF_8);
            var request =
                    HttpRequest.newBuilder(
                                    URI.create(
                                            "https://challenges.cloudflare.com/turnstile/v0/siteverify"))
                            .timeout(Duration.ofSeconds(8))
                            .header("Content-Type", "application/x-www-form-urlencoded")
                            .POST(HttpRequest.BodyPublishers.ofString(body))
                            .build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (!validResult(response.statusCode(), response.body(), hostname))
                throw new DemoException(403, "Verification failed. Please try again.");
            jdbc.update(
                    "UPDATE demo_sessions SET sandbox_verified_until=expires_at WHERE id=? AND"
                        + " expires_at>CURRENT_TIMESTAMP",
                    session);
        } catch (DemoException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DemoException(503, "Verification is temporarily unavailable. Try again.");
        } catch (Exception e) {
            throw new DemoException(503, "Verification is temporarily unavailable. Try again.");
        }
    }

    static boolean validResult(int status, String body, String hostname) {
        try {
            var result = JsonMapper.builder().build().readTree(body);
            return status == 200
                    && result.path("success").asBoolean()
                    && hostname.equals(result.path("hostname").asText())
                    && "mastercard".equals(result.path("action").asText());
        } catch (Exception e) {
            return false;
        }
    }

    public void authorize(UUID payment) {
        if (!required()) return;
        var sessions =
                jdbc.query(
                        "SELECT demo_session_id FROM payouts WHERE id=?",
                        (rs, n) -> rs.getObject(1, UUID.class),
                        payment);
        if (sessions.size() != 1 || sessions.getFirst() == null || !verified(sessions.getFirst()))
            throw new DemoException(403, "Verify this demo session before using an external sandbox.");
    }
}
