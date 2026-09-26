CREATE TABLE payouts (
    id UUID PRIMARY KEY,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    request_fingerprint CHAR(64) NOT NULL,
    recipient_reference VARCHAR(255) NOT NULL,
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(32) NOT NULL,
    provider_reference VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL
);
CREATE TABLE provider_transactions (
    id UUID PRIMARY KEY,
    client_reference UUID NOT NULL UNIQUE,
    provider_reference VARCHAR(255) NOT NULL UNIQUE,
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
