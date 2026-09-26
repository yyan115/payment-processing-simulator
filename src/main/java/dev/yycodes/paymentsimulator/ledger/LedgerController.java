package dev.yycodes.paymentsimulator.ledger;

import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payouts")
public class LedgerController {

    private final LedgerQueryService ledger;

    public LedgerController(LedgerQueryService ledger) {
        this.ledger = ledger;
    }

    @GetMapping("/{id}/ledger")
    public LedgerTransactionResponse ledger(@PathVariable UUID id) {
        return ledger.findByPayoutId(id);
    }
}
