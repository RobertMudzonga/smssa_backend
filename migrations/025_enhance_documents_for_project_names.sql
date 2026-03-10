-- Migration: enhance documents table to support project names and improve document management
-- Adds project_name field and ensures proper relationship tracking

ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type TEXT;

-- Create index on project_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_project_name ON documents (project_name);

-- Add foreign key constraint for project_id if it doesn't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='project_id') THEN
    BEGIN
      ALTER TABLE documents ADD CONSTRAINT documents_project_fk FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END$$;
