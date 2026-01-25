-- 051_add_second_project_manager.sql
-- Adds a second project_manager_id column to support two project managers per project

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_manager_id_2 INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'projects_project_manager_id_2_fkey' 
    AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_project_manager_id_2_fkey
      FOREIGN KEY (project_manager_id_2) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id_2 ON projects(project_manager_id_2);
