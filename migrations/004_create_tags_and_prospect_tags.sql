-- Migration: Create tags and prospect_tags join table

CREATE TABLE IF NOT EXISTS tags (
  tag_id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prospect_tags (
  prospect_tag_id SERIAL PRIMARY KEY,
  prospect_id INTEGER NOT NULL REFERENCES prospects(prospect_id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(prospect_id, tag_id)
);

-- Add index for quick lookup
CREATE INDEX IF NOT EXISTS idx_prospect_tags_prospect_id ON prospect_tags (prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_tags_tag_id ON prospect_tags (tag_id);
