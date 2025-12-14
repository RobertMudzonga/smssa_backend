-- Migration: Create prospect_stages lookup table
-- Run this in your Postgres database (psql or any SQL client)

CREATE TABLE IF NOT EXISTS prospect_stages (
    stage_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_order INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert the 13 prospect stages
INSERT INTO prospect_stages (stage_id, name, display_order, description) VALUES
(1, 'Opportunity', 1, 'Initial opportunity identified'),
(2, 'Qualification', 2, 'Qualifying the prospect'),
(3, 'Needs Analysis', 3, 'Analyzing prospect needs'),
(4, 'Proposal', 4, 'Proposal prepared and sent'),
(5, 'Negotiation', 5, 'Negotiating terms'),
(6, 'Closed Won', 6, 'Deal won - convert to client'),
(7, 'Closed Lost', 7, 'Deal lost'),
(8, 'Follow-up', 8, 'Follow-up required'),
(9, 'On Hold', 9, 'Temporarily on hold'),
(10, 'Cold', 10, 'Cold prospect - needs nurturing'),
(11, 'Warm', 11, 'Warm prospect - engaged'),
(12, 'Hot', 12, 'Hot prospect - ready to close'),
(13, 'Archived', 13, 'Archived - no longer active')
ON CONFLICT (stage_id) DO NOTHING;

-- Add foreign key constraint to prospects table if not already present
DO $$
BEGIN
    IF to_regclass('public.prospects') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_prospects_stage'
    ) THEN
        EXECUTE 'ALTER TABLE prospects ADD CONSTRAINT fk_prospects_stage FOREIGN KEY (current_stage_id) REFERENCES prospect_stages(stage_id) ON DELETE SET DEFAULT';
    END IF;
END
$$;
