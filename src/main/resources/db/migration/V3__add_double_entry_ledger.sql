CREATE TABLE ledger_transactions (
    id UUID PRIMARY KEY,
    payout_id UUID NOT NULL UNIQUE REFERENCES payouts(id),
    transaction_type VARCHAR(64) NOT NULL,
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(id),
    account_code VARCHAR(255) NOT NULL,
    direction VARCHAR(16) NOT NULL,
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_ledger_entries_transaction
    ON ledger_entries (transaction_id);
