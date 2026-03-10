-- Migration: add archived flag to prospects
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_prospects_is_archived ON prospects (is_archived);
