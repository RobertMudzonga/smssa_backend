-- Migration: Add cold_lead_stage to track contact funnel separately from prospect pipeline
-- Run this in your Postgres database

-- Add cold_lead_stage to leads table (101-104 for First/Second/Third Contact, Convert)
ALTER TABLE IF EXISTS leads
ADD COLUMN IF NOT EXISTS cold_lead_stage INTEGER DEFAULT 101;

-- Create index and comment only if the `leads` table exists to avoid failure
DO $$
BEGIN
	IF to_regclass('public.leads') IS NOT NULL THEN
		IF NOT EXISTS (
			SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'leads' AND indexname = 'idx_leads_cold_stage'
		) THEN
			EXECUTE 'CREATE INDEX idx_leads_cold_stage ON leads (cold_lead_stage)';
		END IF;

		EXECUTE 'COMMENT ON COLUMN leads.cold_lead_stage IS ''Cold lead contact funnel stage: 101=First Contact, 102=Second Contact, 103=Third Contact, 104=Convert to Opportunity''';
	END IF;
END
$$;
