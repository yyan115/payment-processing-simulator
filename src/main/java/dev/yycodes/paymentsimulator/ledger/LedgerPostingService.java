package dev.yycodes.paymentsimulator.ledger;

import dev.yycodes.paymentsimulator.payout.Payout;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class LedgerPostingService {

    private final LedgerTransactionRepository transactions;
    private final LedgerEntryRepository entries;

    public LedgerPostingService(
            LedgerTransactionRepository transactions,
            LedgerEntryRepository entries) {
        this.transactions = transactions;
        this.entries = entries;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordPayoutSettlement(Payout payout) {
        if (transactions.existsByPayoutId(payout.getId())) {
            return;
        }

        LedgerTransaction transaction = transactions.save(new LedgerTransaction(
                payout.getId(),
                payout.getAmount(),
                payout.getCurrency()
        ));

        LedgerEntry sellerPayable = new LedgerEntry(
                transaction.getId(),
                "SELLER_PAYABLE:" + payout.getRecipientReference(),
                LedgerDirection.DEBIT,
                payout.getAmount(),
                payout.getCurrency()
        );

        LedgerEntry cashClearing = new LedgerEntry(
                transaction.getId(),
                "CASH_CLEARING",
                LedgerDirection.CREDIT,
                payout.getAmount(),
                payout.getCurrency()
        );

        entries.saveAll(List.of(sellerPayable, cashClearing));
    }
}
