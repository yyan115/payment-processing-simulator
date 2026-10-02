package dev.yycodes.paymentsimulator.demo;

import dev.yycodes.paymentsimulator.provider.ProviderRejectedException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Service
@ConditionalOnProperty(name = "payments.demo.enabled", havingValue = "true")
public class SandboxRequestBudget {
    private final JdbcTemplate jdbc;
    private final SandboxVerification verification;
    private final int sessionLimit;
    private final int minuteLimit;
    private final int dayLimit;

    public SandboxRequestBudget(
            JdbcTemplate jdbc,
            SandboxVerification verification,
            @Value("${payments.demo.mastercard-calls-per-session:10}") int sessionLimit,
            @Value("${payments.demo.mastercard-calls-per-minute:12}") int minuteLimit,
            @Value("${payments.demo.mastercard-calls-per-day:100}") int dayLimit) {
        this.jdbc = jdbc;
        this.verification = verification;
        this.sessionLimit = sessionLimit;
        this.minuteLimit = minuteLimit;
        this.dayLimit = dayLimit;
    }

    @Transactional
    public void consume(java.util.UUID payment) {
        verification.authorize(payment);
        int changed =
                jdbc.update(
                        "UPDATE demo_sessions SET sandbox_calls=sandbox_calls+1 WHERE id=(SELECT"
                            + " demo_session_id FROM payouts WHERE id=?) AND"
                            + " expires_at>CURRENT_TIMESTAMP AND sandbox_calls<?",
                        payment,
                        sessionLimit);
        if (changed == 0)
            throw new ProviderRejectedException(
                    429, "This session has used its external sandbox allowance.");
        consume();
    }

    @Transactional
    public void consume() {
        Instant now = Instant.now();
        jdbc.update("DELETE FROM sandbox_call_budget WHERE expires_at<?", Timestamp.from(now));
        consume("day:" + now.truncatedTo(ChronoUnit.DAYS), dayLimit, now.plus(1, ChronoUnit.DAYS));
        consume(
                "minute:" + now.truncatedTo(ChronoUnit.MINUTES),
                minuteLimit,
                now.plus(2, ChronoUnit.MINUTES));
    }

    private void consume(String key, int limit, Instant expires) {
        int changed =
                jdbc.update(
                        """
                        INSERT INTO sandbox_call_budget(window_key,requests,expires_at) VALUES(?,1,?)
                        ON CONFLICT(window_key) DO UPDATE SET requests=sandbox_call_budget.requests+1
                        WHERE sandbox_call_budget.requests<?
                        """,
                        key,
                        Timestamp.from(expires),
                        limit);
        if (changed == 0)
            throw new ProviderRejectedException(
                    429, "External sandbox demo request limit reached");
    }
}
