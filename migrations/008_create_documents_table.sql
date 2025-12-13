-- Migration: create documents table to store uploaded files in the database
-- This migration is written defensively in case a `documents` table already exists with a different
-- schema (to avoid index creation errors). It will create the table if missing, then ensure the
-- expected columns exist, and finally create indexes if the columns are present.

CREATE TABLE IF NOT EXISTS documents (
  document_id SERIAL PRIMARY KEY
);

-- add columns if missing
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS size BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content BYTEA;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- add foreign key constraint for folder_id if the column exists and the constraint is not present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='folder_id') THEN
    BEGIN
      ALTER TABLE documents ADD CONSTRAINT documents_folder_fk FOREIGN KEY (folder_id) REFERENCES document_folders(folder_id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      -- constraint already exists, ignore
      NULL;
    END;
  END IF;
END$$;

-- create indexes only if columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='project_id') THEN
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents (project_id)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not create idx_documents_project_id: %', SQLERRM;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='folder_id') THEN
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents (folder_id)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not create idx_documents_folder_id: %', SQLERRM;
    END;
  END IF;
END$$;
