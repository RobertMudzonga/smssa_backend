-- Allow document templates to store binary files (PDF, Word) in addition to text templates
ALTER TABLE document_templates
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_mime TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS file_data BYTEA,
  ADD COLUMN IF NOT EXISTS storage_type TEXT NOT NULL DEFAULT 'text';

-- Backfill storage_type for existing rows
UPDATE document_templates SET storage_type = 'text' WHERE storage_type IS NULL;

-- Normalize updated_at for existing rows
UPDATE document_templates SET updated_at = NOW() WHERE updated_at IS NULL;
