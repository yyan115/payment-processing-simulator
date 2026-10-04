package dev.yycodes.paymentsimulator.demo;

import dev.yycodes.paymentsimulator.payout.Payout;
import dev.yycodes.paymentsimulator.provider.SimulationScenarioRegistry;
import dev.yycodes.paymentsimulator.shared.NotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Isolated, temporary workspaces for the public demo. A workspace owns its payouts, expires after a
 * period without requests, and is capped in number and size.
 */
@Service
public class DemoWorkspace {
    public static final String COOKIE = "payout_workspace";
    // The page sends its own workspace id here, so each browser tab has its own workspace.
    public static final String HEADER = "X-Workspace-Id";
    public static final String ATTRIBUTE = DemoWorkspace.class.getName();
    private final JdbcTemplate jdbc;
    private final SimulationScenarioRegistry scenarios;
    private final boolean enabled;
    // Inactivity allowance: every request extends it, so an active visitor never expires.
    private final int seconds;
    // A workspace with no payments has nothing to keep, so it is removed sooner.
    private final int emptySeconds;
    private final int maxPayouts;
    private final int maxSessions;

    public DemoWorkspace(
            JdbcTemplate jdbc,
            SimulationScenarioRegistry scenarios,
            @Value("${payments.demo.enabled:false}") boolean enabled,
            @Value("${payments.demo.session-seconds:21600}") int seconds,
            @Value("${payments.demo.empty-session-seconds:1800}") int emptySeconds,
            @Value("${payments.demo.max-payouts:40}") int maxPayouts,
            @Value("${payments.demo.max-sessions:3000}") int maxSessions) {
        this.jdbc = jdbc;
        this.scenarios = scenarios;
        this.enabled = enabled;
        this.seconds = seconds;
        this.emptySeconds = emptySeconds;
        this.maxPayouts = maxPayouts;
        this.maxSessions = maxSessions;
        if (seconds < 60 || emptySeconds < 60 || maxPayouts < 1 || maxSessions < 1)
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
        String header = request.getHeader(HEADER);
        if (header != null) {
            try {
                return UUID.fromString(header.trim());
            } catch (IllegalArgumentException ignored) {
                return null;
            }
        }
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
        touch(id);
        request.setAttribute(ATTRIBUTE, id);
        return id;
    }

    // Pushes the expiry back after activity. Skips the write unless it moves by a minute or more.
    private void touch(UUID id) {
        boolean used =
                Boolean.TRUE.equals(
                        jdbc.queryForObject(
                                "SELECT EXISTS(SELECT 1 FROM payouts WHERE demo_session_id=?)",
                                Boolean.class,
                                id));
        Instant next = Instant.now().plusSeconds(used ? seconds : emptySeconds);
        jdbc.update(
                "UPDATE demo_sessions SET expires_at=? WHERE id=? AND expires_at<?",
                Timestamp.from(next),
                id,
                Timestamp.from(next.minusSeconds(60)));
    }

    private Instant startedAt(UUID id) {
        return jdbc.queryForObject(
                "SELECT created_at FROM demo_sessions WHERE id=?",
                (rs, n) -> rs.getTimestamp(1).toInstant(),
                id);
    }

    public void assertOwn(Payout payout) {
        if (enabled && !currentId().equals(payout.getDemoSessionId()))
            throw new NotFoundException("Payout was not found in this workspace");
    }

    @Transactional
    public Workspace open(HttpServletRequest request, HttpServletResponse response, boolean reset) {
        if (!enabled) return new Workspace(false, null, 0, maxPayouts, null, null);
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
        if (expires != null && expires.isAfter(Instant.now())) {
            touch(id);
            expires = expiry(id);
        } else {
            Integer count =
                    jdbc.queryForObject(
                            "SELECT COUNT(*) FROM demo_sessions WHERE expires_at>CURRENT_TIMESTAMP",
                            Integer.class);
            if (count != null && count >= maxSessions)
                throw new DemoException(429, "The demo is busy. Please try again shortly.");
            id = UUID.randomUUID();
            Instant now = Instant.now();
            expires = now.plusSeconds(emptySeconds);
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
                        .build()
                        .toString());
        return new Workspace(true, expires, seconds, maxPayouts, startedAt(id), id);
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

    // The id is returned so the page can send it back in the X-Workspace-Id header. Without the
    // header, requests fall back to the browser-session cookie.
    public record Workspace(
            boolean temporary,
            Instant expiresAt,
            int durationSeconds,
            int maxPayouts,
            Instant startedAt,
            UUID id) {}
}
