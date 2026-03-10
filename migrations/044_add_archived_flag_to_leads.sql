-- Migration: add archived flag to leads
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_leads_is_archived ON leads (is_archived);
