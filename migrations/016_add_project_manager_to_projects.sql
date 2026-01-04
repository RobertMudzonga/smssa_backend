-- 016_add_project_manager_to_projects.sql
-- Adds a project_manager_id column referencing employees.id so projects can be linked to employee KPIs/reporting.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_manager_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'projects' AND constraint_name = 'projects_project_manager_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_project_manager_id_fkey
      FOREIGN KEY (project_manager_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id ON projects(project_manager_id);
