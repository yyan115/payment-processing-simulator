package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.audit.PayoutEventResponse;
import dev.yycodes.paymentsimulator.reconciliation.ReconciliationResponse;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payouts")
public class PayoutController {

    private final dev.yycodes.paymentsimulator.demo.SandboxVerification verification;
    private final PayoutService payouts;
    private final PayoutProcessor processor;
    private final PayoutHistoryService history;

    public PayoutController(
            PayoutService payouts,
            PayoutProcessor processor,
            PayoutHistoryService history,
            dev.yycodes.paymentsimulator.demo.SandboxVerification verification) {
        this.verification = verification;
        this.payouts = payouts;
        this.processor = processor;
        this.history = history;
    }

    private void guard(UUID id) {
        if ("mastercard".equals(payouts.get(id).getProvider())) verification.authorize(id);
    }

    @PostMapping
    public ResponseEntity<PayoutResponse> create(
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CreatePayoutRequest request) {
        PayoutCreationResult result = payouts.create(idempotencyKey, request);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(PayoutResponse.from(result.payout()));
    }

    @GetMapping
    public PayoutPage list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return payouts.list(page, size);
    }

    @GetMapping("/{id}")
    public PayoutResponse get(@PathVariable UUID id) {
        return PayoutResponse.from(payouts.get(id));
    }

    @GetMapping("/{id}/events")
    public List<PayoutEventResponse> events(@PathVariable UUID id) {
        payouts.get(id); // Authorize the decoded resource ID before reading or changing it.
        return history.events(id);
    }

    @PostMapping("/{id}/process")
    public PayoutResponse process(@PathVariable UUID id) {
        payouts.get(id); // Authorize the decoded resource ID before reading or changing it.
        guard(id);
        return PayoutResponse.from(processor.process(id));
    }

    @PostMapping("/{id}/retry")
    public PayoutResponse retry(@PathVariable UUID id) {
        payouts.get(id); // Authorize the decoded resource ID before reading or changing it.
        guard(id);
        return PayoutResponse.from(processor.retry(id));
    }

    @PostMapping("/{id}/reconcile")
    public ReconciliationResponse reconcile(@PathVariable UUID id) {
        payouts.get(id); // Authorize the decoded resource ID before reading or changing it.
        guard(id);
        return ReconciliationResponse.from(processor.reconcile(id));
    }
}
