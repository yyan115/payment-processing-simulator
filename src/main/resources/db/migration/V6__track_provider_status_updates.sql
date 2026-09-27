ALTER TABLE provider_transactions
    ADD COLUMN updated_at TIMESTAMPTZ;

UPDATE provider_transactions
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE provider_transactions
    ALTER COLUMN updated_at SET NOT NULL;
