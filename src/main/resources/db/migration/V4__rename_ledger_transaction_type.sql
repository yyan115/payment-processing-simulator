UPDATE ledger_transactions
SET transaction_type = 'PAYOUT_CONFIRMED'
WHERE transaction_type = 'PAYOUT_SETTLED';
