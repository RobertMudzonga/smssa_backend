-- Migration: Add legal_case_id to documents table
-- Allows documents to be linked to legal cases

-- Add the legal_case_id column
ALTER TABLE documents ADD COLUMN IF NOT EXISTS legal_case_id INTEGER;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'documents_legal_case_fk' 
    AND table_name = 'documents'
  ) THEN
    ALTER TABLE documents 
    ADD CONSTRAINT documents_legal_case_fk 
    FOREIGN KEY (legal_case_id) REFERENCES legal_cases(case_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not add FK constraint: %', SQLERRM;
END$$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_legal_case_id ON documents(legal_case_id);

-- Add comment for documentation
COMMENT ON COLUMN documents.legal_case_id IS 'Reference to legal_cases.case_id for legal project documents';
