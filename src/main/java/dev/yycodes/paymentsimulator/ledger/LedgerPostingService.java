package dev.yycodes.paymentsimulator.ledger;

import dev.yycodes.paymentsimulator.payout.Payout;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

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
    public void recordPayoutConfirmation(Payout payout) {
        UUID transactionId = UUID.randomUUID();

        int inserted = transactions.insertIfAbsent(
                transactionId,
                payout.getId(),
                LedgerTransactionType.PAYOUT_CONFIRMED.name(),
                payout.getAmount(),
                payout.getCurrency(),
                Instant.now()
        );

        if (inserted == 0) {
            return;
        }

        LedgerEntry sellerPayable = new LedgerEntry(
                transactionId,
                "SELLER_PAYABLE:" + payout.getRecipientReference(),
                LedgerDirection.DEBIT,
                payout.getAmount(),
                payout.getCurrency()
        );

        LedgerEntry cashClearing = new LedgerEntry(
                transactionId,
                "CASH_CLEARING",
                LedgerDirection.CREDIT,
                payout.getAmount(),
                payout.getCurrency()
        );

        entries.saveAll(List.of(sellerPayable, cashClearing));
    }
}
