ALTER TABLE payouts
    ADD CONSTRAINT chk_payout_status
        CHECK (status IN ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
    ADD CONSTRAINT chk_payout_currency
        CHECK (currency ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT chk_payout_fingerprint
        CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT chk_payout_idempotency_key_nonblank
        CHECK (btrim(idempotency_key) <> ''),
    ADD CONSTRAINT chk_payout_recipient_nonblank
        CHECK (btrim(recipient_reference) <> '');

ALTER TABLE provider_transactions
    ADD CONSTRAINT fk_provider_transaction_payout
        FOREIGN KEY (client_reference) REFERENCES payouts(id),
    ADD CONSTRAINT chk_provider_status
        CHECK (status IN ('SUCCEEDED', 'DECLINED', 'UNKNOWN', 'PENDING')),
    ADD CONSTRAINT chk_provider_currency
        CHECK (currency ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT chk_provider_reference_nonblank
        CHECK (btrim(provider_reference) <> '');

ALTER TABLE payout_events
    ADD CONSTRAINT chk_payout_event_type
        CHECK (event_type IN (
            'PROCESSING_STARTED',
            'PROVIDER_SUCCEEDED',
            'PROVIDER_DECLINED',
            'PROVIDER_REJECTED',
            'PROVIDER_UNKNOWN',
            'PROVIDER_PENDING',
            'PROVIDER_TIMEOUT',
            'PROVIDER_RETRY_SUCCEEDED',
            'PROVIDER_RETRY_DECLINED',
            'PROVIDER_RETRY_REJECTED',
            'PROVIDER_RETRY_UNKNOWN',
            'PROVIDER_RETRY_PENDING',
            'PROVIDER_RETRY_TIMEOUT',
            'RECONCILIATION_SUCCEEDED',
            'RECONCILIATION_FAILED',
            'RECONCILIATION_UNRESOLVED'
        )),
    ADD CONSTRAINT chk_payout_event_from_status
        CHECK (from_status IN ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
    ADD CONSTRAINT chk_payout_event_to_status
        CHECK (to_status IN ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'));

ALTER TABLE reconciliation_attempts
    ADD CONSTRAINT chk_reconciliation_provider_status
        CHECK (
            provider_status IS NULL
            OR provider_status IN ('SUCCEEDED', 'DECLINED', 'UNKNOWN', 'PENDING')
        ),
    ADD CONSTRAINT chk_reconciliation_outcome
        CHECK (outcome IN ('RESOLVED_SUCCEEDED', 'RESOLVED_FAILED', 'STILL_UNKNOWN'));

ALTER TABLE ledger_transactions
    ADD CONSTRAINT chk_ledger_transaction_type
        CHECK (transaction_type = 'PAYOUT_CONFIRMED'),
    ADD CONSTRAINT chk_ledger_transaction_currency
        CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE ledger_entries
    ADD CONSTRAINT chk_ledger_entry_direction
        CHECK (direction IN ('DEBIT', 'CREDIT')),
    ADD CONSTRAINT chk_ledger_entry_currency
        CHECK (currency ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT chk_ledger_account_nonblank
        CHECK (btrim(account_code) <> '');
