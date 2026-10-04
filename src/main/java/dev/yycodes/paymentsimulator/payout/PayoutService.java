package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.demo.DemoException;
import dev.yycodes.paymentsimulator.demo.DemoWorkspace;
import dev.yycodes.paymentsimulator.provider.ProviderCatalog;
import dev.yycodes.paymentsimulator.shared.BadRequestException;
import dev.yycodes.paymentsimulator.shared.ConflictException;
import dev.yycodes.paymentsimulator.shared.MoneyAmounts;
import dev.yycodes.paymentsimulator.shared.NotFoundException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

/**
 * Creates payouts and enforces idempotency. A repeated key with the same request returns the
 * original payout, and the same key with a different request is a conflict.
 */
@Service
public class PayoutService {
    private final PayoutRepository repository;
    private final ProviderCatalog providers;
    private final DemoWorkspace workspace;

    public PayoutService(
            PayoutRepository repository, ProviderCatalog providers, DemoWorkspace workspace) {
        this.repository = repository;
        this.providers = providers;
        this.workspace = workspace;
    }

    public PayoutCreationResult create(String idempotencyKey, CreatePayoutRequest request) {
        String key = normalizeKey(idempotencyKey);
        UUID session = workspace.currentId();
        if (session != null) key = session + ":" + fingerprint(key, BigDecimal.ZERO, "SESSION");
        String provider = providers.resolve(request.provider());
        providers.require(provider);
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
            assertSameRequest(existing.get(), fingerprint, provider);
            return new PayoutCreationResult(existing.get(), false);
        }

        try {
            Payout saved =
                    repository.saveAndFlush(
                            new Payout(
                                    key,
                                    fingerprint,
                                    recipient,
                                    amount,
                                    currency,
                                    provider,
                                    session));
            return new PayoutCreationResult(saved, true);
        } catch (DataIntegrityViolationException race) {
            var found = repository.findByIdempotencyKey(key);
            if (found.isEmpty() && session != null)
                throw new DemoException(
                        429,
                        "This workspace has reached its payout limit or expired. Start a new"
                                + " workspace.");
            Payout winner = found.orElseThrow(() -> race);
            assertSameRequest(winner, fingerprint, provider);
            return new PayoutCreationResult(winner, false);
        }
    }

    public PayoutPage list(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new BadRequestException(
                    "page must be non-negative and size must be between 1 and 100");
        }
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        UUID session = workspace.currentId();
        var result =
                session == null
                        ? repository.findAll(pageable)
                        : repository.findByDemoSessionId(session, pageable);
        return new PayoutPage(
                result.getContent().stream().map(PayoutResponse::from).toList(),
                result.getTotalElements(),
                page,
                size);
    }

    public Payout get(UUID id) {
        var payout =
                repository
                        .findById(id)
                        .orElseThrow(
                                () -> new NotFoundException("Payout " + id + " was not found"));
        workspace.assertOwn(payout);
        return payout;
    }

    private static String normalizeKey(String key) {
        if (key == null || key.isBlank())
            throw new BadRequestException("Idempotency-Key header is required");
        String normalized = key.trim();
        if (normalized.length() > 255)
            throw new BadRequestException("Idempotency-Key must be at most 255 characters");
        return normalized;
    }

    private void assertSameRequest(Payout payout, String fingerprint, String provider) {
        if (!payout.getRequestFingerprint().equals(fingerprint)
                || !providers.resolve(payout.getProvider()).equals(provider)) {
            throw new ConflictException(
                    "Idempotency key was already used for a different payout request");
        }
    }

    private static String fingerprint(String recipient, BigDecimal amount, String currency) {
        String canonical = recipient + "\n" + amount.toPlainString() + "\n" + currency;
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}
