package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.shared.BadRequestException;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import dev.yycodes.paymentsimulator.shared.NotFoundException;
import dev.yycodes.paymentsimulator.shared.MoneyAmounts;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class PayoutService {
    private final PayoutRepository repository;
    public PayoutService(PayoutRepository repository) { this.repository = repository; }

    public PayoutCreationResult create(String idempotencyKey, CreatePayoutRequest request) {
        String key = normalizeKey(idempotencyKey);
        String recipient = request.recipientReference().trim();
        final String currency;
        final BigDecimal amount;
        try {
            currency = MoneyAmounts.normalizeCurrencyCode(request.currency());
            amount = MoneyAmounts.normalizeMajorUnits(request.amount(), currency);
        } catch (IllegalArgumentException invalidMoney) {
            throw new BadRequestException(invalidMoney.getMessage());
        }
        String fingerprint = fingerprint(recipient, amount, currency);

        var existing = repository.findByIdempotencyKey(key);
        if (existing.isPresent()) {
            assertSameRequest(existing.get(), fingerprint);
            return new PayoutCreationResult(existing.get(), false);
        }

        try {
            Payout saved = repository.saveAndFlush(new Payout(key, fingerprint, recipient, amount, currency));
            return new PayoutCreationResult(saved, true);
        } catch (DataIntegrityViolationException race) {
            Payout winner = repository.findByIdempotencyKey(key).orElseThrow(() -> race);
            assertSameRequest(winner, fingerprint);
            return new PayoutCreationResult(winner, false);
        }
    }

    public Payout get(UUID id) {
        return repository.findById(id).orElseThrow(() -> new NotFoundException("Payout " + id + " was not found"));
    }

    private static String normalizeKey(String key) {
        if (key == null || key.isBlank()) throw new BadRequestException("Idempotency-Key header is required");
        String normalized = key.trim();
        if (normalized.length() > 255) throw new BadRequestException("Idempotency-Key must be at most 255 characters");
        return normalized;
    }

    private static void assertSameRequest(Payout payout, String fingerprint) {
        if (!payout.getRequestFingerprint().equals(fingerprint)) {
            throw new ConflictException("Idempotency key was already used for a different payout request");
        }
    }

    private static String fingerprint(String recipient, BigDecimal amount, String currency) {
        String canonical = recipient + "\n" + amount.toPlainString() + "\n" + currency;
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}
