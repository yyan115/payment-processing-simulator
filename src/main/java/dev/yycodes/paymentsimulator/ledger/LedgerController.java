package dev.yycodes.paymentsimulator.ledger;

import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payouts")
public class LedgerController {

    private final LedgerQueryService ledger;
    private final dev.yycodes.paymentsimulator.payout.PayoutService payouts;

    public LedgerController(
            LedgerQueryService ledger, dev.yycodes.paymentsimulator.payout.PayoutService payouts) {
        this.payouts = payouts;
        this.ledger = ledger;
    }

    @GetMapping("/{id}/ledger")
    public LedgerTransactionResponse ledger(@PathVariable UUID id) {
        payouts.get(id);
        return ledger.findByPayoutId(id);
    }
}
