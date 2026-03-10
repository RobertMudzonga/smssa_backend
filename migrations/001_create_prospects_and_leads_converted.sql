-- Migration: create prospects table and add converted flag to leads
-- Run this in your Postgres database (psql or any SQL client)

CREATE TABLE IF NOT EXISTS prospects (
    prospect_id SERIAL PRIMARY KEY,
    lead_id INTEGER,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    company TEXT,
    source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add a converted flag to leads if it doesn't already exist
-- Use IF EXISTS so the migration is safe when the `leads` table isn't present yet.
ALTER TABLE IF EXISTS leads
ADD COLUMN IF NOT EXISTS converted BOOLEAN DEFAULT FALSE;

-- Optional: create an index on lead_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_prospects_lead_id ON prospects (lead_id);
