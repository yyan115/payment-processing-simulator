ALTER TABLE ledger_entries
    ALTER COLUMN account_code TYPE VARCHAR(512);

CREATE INDEX idx_payouts_status_updated_at
    ON payouts (status, updated_at);
