package dev.yycodes.paymentsimulator.demo;

import dev.yycodes.paymentsimulator.payout.Payout;
import dev.yycodes.paymentsimulator.provider.SimulationScenarioRegistry;
import dev.yycodes.paymentsimulator.shared.NotFoundException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

@Service
public class DemoWorkspace {
    public static final String COOKIE = "payout_workspace";
    public static final String ATTRIBUTE = DemoWorkspace.class.getName();
    private final JdbcTemplate jdbc;
    private final SimulationScenarioRegistry scenarios;
    private final boolean enabled;
    private final int seconds;
    private final int maxPayouts;

    public DemoWorkspace(
            JdbcTemplate jdbc,
            SimulationScenarioRegistry scenarios,
            @Value("${payments.demo.enabled:false}") boolean enabled,
            @Value("${payments.demo.session-seconds:900}") int seconds,
            @Value("${payments.demo.max-payouts:40}") int maxPayouts) {
        this.jdbc = jdbc;
        this.scenarios = scenarios;
        this.enabled = enabled;
        this.seconds = seconds;
        this.maxPayouts = maxPayouts;
        if (seconds < 60 || maxPayouts < 1)
            throw new IllegalArgumentException("Invalid demo workspace limits");
    }

    public boolean enabled() {
        return enabled;
    }

    public UUID currentId() {
        if (!enabled) return null;
        var attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes servlet) {
            Object id = servlet.getRequest().getAttribute(ATTRIBUTE);
            if (id instanceof UUID uuid) return uuid;
        }
        throw new DemoException(
                410, "Your workspace has expired. Start a new workspace to continue.");
    }

    public UUID cookieId(HttpServletRequest request) {
        if (request.getCookies() != null)
            for (var cookie : request.getCookies()) {
                if (cookie.getName().equals(COOKIE)) {
                    try {
                        return UUID.fromString(cookie.getValue());
                    } catch (IllegalArgumentException ignored) {
                        return null;
                    }
                }
            }
        return null;
    }

    public Instant expiry(UUID id) {
        if (id == null) return null;
        var values =
                jdbc.query(
                        "SELECT expires_at FROM demo_sessions WHERE id=?",
                        (rs, n) -> rs.getTimestamp(1).toInstant(),
                        id);
        return values.isEmpty() ? null : values.getFirst();
    }

    public UUID requireActive(HttpServletRequest request) {
        UUID id = cookieId(request);
        Instant expires = expiry(id);
        if (expires == null || !expires.isAfter(Instant.now()))
            throw new DemoException(
                    410, "Your workspace has expired. Start a new workspace to continue.");
        request.setAttribute(ATTRIBUTE, id);
        return id;
    }

    public void assertOwn(Payout payout) {
        if (enabled && !currentId().equals(payout.getDemoSessionId()))
            throw new NotFoundException("Payout was not found in this workspace");
    }

    @Transactional
    public Workspace open(HttpServletRequest request, HttpServletResponse response, boolean reset) {
        if (!enabled) return new Workspace(false, null, 0, maxPayouts);
        // Serialize admissions across application instances, bounding public demo storage.
        jdbc.execute("SELECT pg_advisory_xact_lock(782145991)");
        UUID id = cookieId(request);
        Instant expires = expiry(id);
        if (reset && expires != null) {
            jdbc.update(
                    "UPDATE demo_sessions SET expires_at=LEAST(expires_at,CURRENT_TIMESTAMP) WHERE"
                        + " id=?",
                    id);
            expires = null;
        }
        if (expires == null || !expires.isAfter(Instant.now())) {
            Integer count =
                    jdbc.queryForObject(
                            "SELECT COUNT(*) FROM demo_sessions WHERE expires_at>CURRENT_TIMESTAMP",
                            Integer.class);
            if (count != null && count >= 300)
                throw new DemoException(429, "The demo is busy. Please try again shortly.");
            id = UUID.randomUUID();
            Instant now = Instant.now();
            expires = now.plusSeconds(seconds);
            jdbc.update(
                    "INSERT INTO demo_sessions(id,created_at,expires_at,max_payouts)"
                        + " VALUES(?,?,?,?)",
                    id,
                    Timestamp.from(now),
                    Timestamp.from(expires),
                    maxPayouts);
        }
        response.addHeader(
                "Set-Cookie",
                ResponseCookie.from(COOKIE, id.toString())
                        .httpOnly(true)
                        .secure(request.isSecure())
                        .sameSite("Strict")
                        .path("/")
                        .maxAge(seconds)
                        .build()
                        .toString());
        return new Workspace(true, expires, seconds, maxPayouts);
    }

    @Scheduled(fixedDelayString = "${payments.demo.cleanup-ms:60000}")
    @Transactional
    public void purgeExpired() {
        if (!enabled) return;
        // Grace period allows in-flight network calls to finish before their test data is removed.
        var expired =
                jdbc.query(
                        "SELECT id FROM demo_sessions WHERE expires_at<? ORDER BY expires_at LIMIT"
                            + " 100 FOR UPDATE SKIP LOCKED",
                        (rs, n) -> rs.getObject(1, UUID.class),
                        Timestamp.from(Instant.now().minusSeconds(60)));
        for (UUID session : expired) {
            var ids =
                    jdbc.query(
                            "SELECT id FROM payouts WHERE demo_session_id=?",
                            (rs, n) -> rs.getObject(1, UUID.class),
                            session);
            jdbc.update(
                    "DELETE FROM ledger_entries WHERE transaction_id IN (SELECT l.id FROM"
                        + " ledger_transactions l JOIN payouts p ON p.id=l.payout_id WHERE"
                        + " p.demo_session_id=?)",
                    session);
            jdbc.update(
                    "DELETE FROM ledger_transactions WHERE payout_id IN (SELECT id FROM payouts"
                        + " WHERE demo_session_id=?)",
                    session);
            jdbc.update(
                    "DELETE FROM payout_events WHERE payout_id IN (SELECT id FROM payouts WHERE"
                        + " demo_session_id=?)",
                    session);
            jdbc.update(
                    "DELETE FROM reconciliation_attempts WHERE payout_id IN (SELECT id FROM payouts"
                        + " WHERE demo_session_id=?)",
                    session);
            jdbc.update(
                    "DELETE FROM provider_transactions WHERE client_reference IN (SELECT id FROM"
                        + " payouts WHERE demo_session_id=?)",
                    session);
            jdbc.update("DELETE FROM payouts WHERE demo_session_id=?", session);
            jdbc.update("DELETE FROM demo_sessions WHERE id=?", session);
            ids.forEach(scenarios::remove);
        }
    }

    public record Workspace(
            boolean temporary, Instant expiresAt, int durationSeconds, int maxPayouts) {}
}
