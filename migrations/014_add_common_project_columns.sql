-- 014_add_common_project_columns.sql
-- Adds common project columns if they do not already exist.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS case_type TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS client_id INTEGER,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS progress INTEGER;

-- Optionally add an index on client_id for lookups
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
