ALTER TABLE demo_sessions ADD COLUMN sandbox_verified_until timestamptz;
ALTER TABLE demo_sessions ADD COLUMN sandbox_calls integer NOT NULL DEFAULT 0 CHECK (sandbox_calls >= 0);
