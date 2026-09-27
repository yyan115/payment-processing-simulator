CREATE TABLE demo_sessions (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    max_payouts INTEGER NOT NULL DEFAULT 40 CHECK(max_payouts>0)
);
CREATE INDEX idx_demo_sessions_expiry ON demo_sessions(expires_at);
ALTER TABLE payouts ADD COLUMN provider VARCHAR(16)
    CHECK (provider IN ('simulated', 'mastercard'));
ALTER TABLE payouts ADD COLUMN demo_session_id UUID REFERENCES demo_sessions(id);
CREATE INDEX idx_payouts_session_created ON payouts(demo_session_id, created_at DESC);

-- Only explicitly temporary, expired demo workspaces can be purged.
-- Updates and deletion of ordinary financial records remain prohibited.
CREATE FUNCTION expired_demo_payout(target UUID) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM payouts p JOIN demo_sessions s ON s.id = p.demo_session_id
                   WHERE p.id = target AND s.expires_at <= CURRENT_TIMESTAMP);
$$;
CREATE OR REPLACE FUNCTION prevent_ledger_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target_payout UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'ledger_transactions' THEN target_payout := OLD.payout_id;
        ELSE SELECT payout_id INTO target_payout FROM ledger_transactions WHERE id = OLD.transaction_id;
        END IF;
        IF expired_demo_payout(target_payout) THEN RETURN OLD; END IF;
    END IF;
    RAISE EXCEPTION 'ledger rows are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE OR REPLACE FUNCTION prevent_history_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' AND expired_demo_payout(OLD.payout_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'audit history rows are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION guard_demo_payout_admission() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE session_expiry TIMESTAMPTZ; session_limit INTEGER;
BEGIN
    IF NEW.demo_session_id IS NULL THEN RETURN NEW; END IF;
    SELECT expires_at,max_payouts INTO session_expiry,session_limit FROM demo_sessions
        WHERE id=NEW.demo_session_id FOR UPDATE;
    IF NOT FOUND OR session_expiry <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'demo workspace expired' USING ERRCODE='23514';
    END IF;
    IF (SELECT COUNT(*) FROM payouts WHERE demo_session_id=NEW.demo_session_id)>=session_limit THEN
        RAISE EXCEPTION 'demo workspace payout limit reached' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER payout_demo_admission BEFORE INSERT ON payouts
FOR EACH ROW EXECUTE FUNCTION guard_demo_payout_admission();

CREATE TABLE sandbox_call_budget (
    window_key VARCHAR(40) PRIMARY KEY,
    requests INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
