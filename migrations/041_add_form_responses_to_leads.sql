-- Migration 041: Add form_responses column to leads table
-- This column stores raw question/answer pairs from Facebook Lead Ads and other forms
-- as JSON for display in a comments/responses section

ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_responses JSONB;

COMMENT ON COLUMN leads.form_responses IS 'Raw form questions and answers from lead generation forms (e.g., Facebook Lead Ads) stored as JSON array of {question, answer} objects';

-- Create index for JSON queries if needed
CREATE INDEX IF NOT EXISTS idx_leads_form_responses ON leads USING GIN (form_responses);
