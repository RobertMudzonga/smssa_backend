-- Migration: add deal_name to prospects
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS deal_name TEXT;

CREATE INDEX IF NOT EXISTS idx_prospects_deal_name ON prospects (deal_name);
