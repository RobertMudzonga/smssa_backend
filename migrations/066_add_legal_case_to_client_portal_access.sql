-- Add legal_case_id support to client_portal_access table
ALTER TABLE client_portal_access ADD COLUMN IF NOT EXISTS legal_case_id INTEGER;

-- Create index for legal case lookups
CREATE INDEX IF NOT EXISTS idx_client_portal_access_legal_case_id 
  ON client_portal_access (legal_case_id);

-- Add constraint to ensure either project_id or legal_case_id is set (but not both required)
-- This allows the table to be used for both projects and legal cases
