-- 035_fix_project_name_constraint.sql
-- Fixes the project_name constraint for ON CONFLICT to work properly
-- PostgreSQL ON CONFLICT needs a simple UNIQUE constraint, not a partial index

BEGIN;

-- Drop the partial unique index that has a WHERE clause
DROP INDEX IF EXISTS idx_projects_unique_project_name;

-- Drop the inline UNIQUE constraint if it exists
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_name_key;

-- Create a proper simple UNIQUE constraint (not partial) if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'projects_project_name_unique' 
    AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_project_name_unique UNIQUE (project_name);
  END IF;
END $$;

-- Create a simple index on project_name for performance
CREATE INDEX IF NOT EXISTS idx_projects_project_name ON projects(project_name);

COMMIT;
