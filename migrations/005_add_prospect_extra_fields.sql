-- Migration: Add additional prospect fields
-- Adds assigned_to, quote and finance fields used by the frontend

ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS assigned_to TEXT;

ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS quote_sent_date DATE;

ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS quote_amount NUMERIC(12,2);

ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS professional_fees NUMERIC(12,2);

ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2);

ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS expected_closing_date DATE;

ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_prospects_assigned_to ON prospects (assigned_to);
