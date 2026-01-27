-- Migration: Add file hash, expiry date, and tags to documents table
-- Adds support for deduplication, expiration tracking, and document tagging

-- Add file_hash for deduplication
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);

-- Add expiry_date for tracking document validity (e.g., passport expiration)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Add tags for flexible categorization (stored as comma-separated or JSON)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT;

-- Add version tracking
ALTER TABLE documents ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_document_id INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_latest_version BOOLEAN DEFAULT true;

-- Create index on file_hash for fast duplicate detection
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents (file_hash);

-- Create index on expiry_date for finding expiring documents
CREATE INDEX IF NOT EXISTS idx_documents_expiry_date ON documents (expiry_date);

-- Create index on parent_document_id for version history
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents (parent_document_id);

-- Add foreign key constraint for parent_document_id (self-referencing)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='parent_document_id') THEN
    BEGIN
      ALTER TABLE documents ADD CONSTRAINT documents_parent_fk FOREIGN KEY (parent_document_id) REFERENCES documents(document_id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END$$;

-- Create unique constraint on file_hash + project_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique_hash_project ON documents (file_hash, project_id) WHERE file_hash IS NOT NULL;
