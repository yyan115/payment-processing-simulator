CREATE OR REPLACE FUNCTION validate_ledger_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_transaction_id UUID;
    expected_amount NUMERIC(19, 4);
    expected_currency VARCHAR(3);
    entry_count INTEGER;
    debit_total NUMERIC(19, 4);
    credit_total NUMERIC(19, 4);
    currency_mismatches INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'ledger_transactions' THEN
        target_transaction_id := NEW.id;
    ELSE
        target_transaction_id := NEW.transaction_id;
    END IF;

    SELECT amount, currency
    INTO expected_amount, expected_currency
    FROM ledger_transactions
    WHERE id = target_transaction_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT
        COUNT(*),
        COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'), 0),
        COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT'), 0),
        COUNT(*) FILTER (WHERE currency <> expected_currency)
    INTO
        entry_count,
        debit_total,
        credit_total,
        currency_mismatches
    FROM ledger_entries
    WHERE transaction_id = target_transaction_id;

    IF entry_count <> 2
       OR debit_total <> expected_amount
       OR credit_total <> expected_amount
       OR currency_mismatches <> 0 THEN
        RAISE EXCEPTION
            'ledger transaction % is not balanced', target_transaction_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_transaction_balance_check
AFTER INSERT OR UPDATE ON ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_ledger_balance();

CREATE CONSTRAINT TRIGGER ledger_entry_balance_check
AFTER INSERT OR UPDATE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_ledger_balance();
