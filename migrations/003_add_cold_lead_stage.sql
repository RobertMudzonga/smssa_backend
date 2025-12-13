-- Migration: Add cold_lead_stage to track contact funnel separately from prospect pipeline
-- Run this in your Postgres database

-- Add cold_lead_stage to leads table (101-104 for First/Second/Third Contact, Convert)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS cold_lead_stage INTEGER DEFAULT 101;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_leads_cold_stage ON leads (cold_lead_stage);

-- Comment to explain the column
COMMENT ON COLUMN leads.cold_lead_stage IS 'Cold lead contact funnel stage: 101=First Contact, 102=Second Contact, 103=Third Contact, 104=Convert to Opportunity';
