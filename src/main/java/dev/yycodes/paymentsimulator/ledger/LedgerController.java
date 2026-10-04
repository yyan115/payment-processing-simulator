package dev.yycodes.paymentsimulator.ledger;

import dev.yycodes.paymentsimulator.payout.PayoutService;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/payouts")
public class LedgerController {

    private final LedgerQueryService ledger;
    private final PayoutService payouts;

    public LedgerController(LedgerQueryService ledger, PayoutService payouts) {
        this.payouts = payouts;
        this.ledger = ledger;
    }

    @GetMapping("/{id}/ledger")
    public LedgerTransactionResponse ledger(@PathVariable UUID id) {
        payouts.get(id);
        return ledger.findByPayoutId(id);
    }
}
