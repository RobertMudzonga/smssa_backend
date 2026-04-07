-- Migration: Add Corporate Client Support to Projects
-- Purpose: Link projects to corporate clients for visa application management

ALTER TABLE projects 
ADD COLUMN corporate_client_id INTEGER REFERENCES corporate_clients(corporate_id) ON DELETE CASCADE;

-- Add index for faster queries
CREATE INDEX idx_projects_corporate_client ON projects(corporate_client_id);

-- Add comment to document the relationship
COMMENT ON COLUMN projects.corporate_client_id IS 'References the corporate client this project (visa application) belongs to';
