-- Migration: Add stage tracking and notes to prospects table
-- Run this in your Postgres database (psql or any SQL client)

-- Add current_stage_id to prospects table (defaults to stage 1 = Opportunity)
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS current_stage_id INTEGER DEFAULT 1;

-- Add updated_at timestamp
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add notes field for prospect details
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index on current_stage_id for faster filtering
CREATE INDEX IF NOT EXISTS idx_prospects_stage_id ON prospects (current_stage_id);

-- Add foreign key constraint to prospect_stages table (if it exists)
-- Uncomment the line below if you have a prospect_stages table
-- ALTER TABLE prospects ADD CONSTRAINT fk_prospects_stage FOREIGN KEY (current_stage_id) REFERENCES prospect_stages(stage_id);
