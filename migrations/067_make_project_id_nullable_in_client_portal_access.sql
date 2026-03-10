-- Make project_id nullable to support legal cases
ALTER TABLE client_portal_access ALTER COLUMN project_id DROP NOT NULL;

-- Add a check constraint to ensure either project_id OR legal_case_id is set
ALTER TABLE client_portal_access DROP CONSTRAINT IF EXISTS chk_portal_entity;
ALTER TABLE client_portal_access ADD CONSTRAINT chk_portal_entity 
  CHECK (project_id IS NOT NULL OR legal_case_id IS NOT NULL);
