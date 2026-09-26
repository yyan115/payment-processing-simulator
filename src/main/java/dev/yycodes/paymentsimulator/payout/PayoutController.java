package dev.yycodes.paymentsimulator.payout;

import dev.yycodes.paymentsimulator.provider.SimulatePayoutRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payouts")
public class PayoutController {
    private final PayoutService payouts;
    private final PayoutProcessor processor;

    public PayoutController(PayoutService payouts, PayoutProcessor processor) {
        this.payouts = payouts;
        this.processor = processor;
    }

    @PostMapping
    public ResponseEntity<PayoutResponse> create(
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CreatePayoutRequest request) {
        PayoutCreationResult result = payouts.create(idempotencyKey, request);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(PayoutResponse.from(result.payout()));
    }

    @GetMapping("/{id}")
    public PayoutResponse get(@PathVariable UUID id) {
        return PayoutResponse.from(payouts.get(id));
    }

    @PostMapping("/{id}/process")
    public PayoutResponse process(@PathVariable UUID id, @Valid @RequestBody SimulatePayoutRequest request) {
        return PayoutResponse.from(processor.process(id, request.outcome()));
    }

    @PostMapping("/{id}/reconcile")
    public PayoutResponse reconcile(@PathVariable UUID id) {
        return PayoutResponse.from(processor.reconcile(id));
    }
}
