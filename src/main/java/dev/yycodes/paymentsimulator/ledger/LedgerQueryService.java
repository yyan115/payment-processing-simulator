package dev.yycodes.paymentsimulator.ledger;

import dev.yycodes.paymentsimulator.shared.NotFoundException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LedgerQueryService {

    private final LedgerTransactionRepository transactions;
    private final LedgerEntryRepository entries;

    public LedgerQueryService(
            LedgerTransactionRepository transactions, LedgerEntryRepository entries) {
        this.transactions = transactions;
        this.entries = entries;
    }

    @Transactional(readOnly = true)
    public LedgerTransactionResponse findByPayoutId(UUID payoutId) {
        LedgerTransaction transaction =
                transactions
                        .findByPayoutId(payoutId)
                        .orElseThrow(
                                () ->
                                        new NotFoundException(
                                                "No confirmed ledger transaction exists for payout "
                                                        + payoutId));

        var lines =
                entries.findByTransactionIdOrderByCreatedAtAsc(transaction.getId()).stream()
                        .map(LedgerEntryResponse::from)
                        .toList();

        return new LedgerTransactionResponse(
                transaction.getId(),
                transaction.getPayoutId(),
                transaction.getTransactionType(),
                transaction.getAmount(),
                transaction.getCurrency(),
                transaction.getCreatedAt(),
                lines);
    }
}
