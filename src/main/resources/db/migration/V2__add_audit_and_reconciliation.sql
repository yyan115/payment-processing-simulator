CREATE TABLE payout_events (
    id UUID PRIMARY KEY,
    payout_id UUID NOT NULL REFERENCES payouts(id),
    event_type VARCHAR(64) NOT NULL,
    from_status VARCHAR(32) NOT NULL,
    to_status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_payout_events_payout_created
    ON payout_events (payout_id, created_at);

CREATE TABLE reconciliation_attempts (
    id UUID PRIMARY KEY,
    payout_id UUID NOT NULL REFERENCES payouts(id),
    provider_record_found BOOLEAN NOT NULL,
    provider_status VARCHAR(32),
    outcome VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_reconciliation_attempts_payout_created
    ON reconciliation_attempts (payout_id, created_at);
