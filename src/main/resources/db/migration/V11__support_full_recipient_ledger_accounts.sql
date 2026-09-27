-- A valid 255-character recipient also needs room for the SELLER_PAYABLE: prefix.
ALTER TABLE ledger_entries ALTER COLUMN account_code TYPE VARCHAR(512);
