CREATE OR REPLACE FUNCTION prevent_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'audit history rows are immutable'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER payout_events_immutable
BEFORE UPDATE OR DELETE ON payout_events
FOR EACH ROW
EXECUTE FUNCTION prevent_history_mutation();

CREATE TRIGGER reconciliation_attempts_immutable
BEFORE UPDATE OR DELETE ON reconciliation_attempts
FOR EACH ROW
EXECUTE FUNCTION prevent_history_mutation();
