-- Visa Direct is a third payment provider next to the simulator and Mastercard Send.
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_provider_check;
ALTER TABLE payouts
    ADD CONSTRAINT payouts_provider_check
    CHECK (provider IN ('simulated', 'mastercard', 'visa'));
