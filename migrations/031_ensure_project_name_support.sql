-- 031_ensure_project_name_support.sql
-- Ensures project_name column exists and can be used as an alternative identifier
-- This is a simpler approach than restructuring the primary key

BEGIN;

-- Ensure project_name column exists
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_name TEXT UNIQUE;

-- Ensure project_manager_id exists for manager assignments
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_manager_id INTEGER;

-- Create a unique index on project_name to ensure uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_unique_project_name ON projects(project_name) 
WHERE project_name IS NOT NULL;

-- Ensure all dependent tables can reference projects by ID
-- These tables should already exist from previous migrations, but ensure they do

-- Recreate or ensure project_documents table
CREATE TABLE IF NOT EXISTS project_documents (
  project_document_id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(project_id) ON DELETE CASCADE,
  document_id INTEGER,
  status TEXT DEFAULT 'Pending',
  notes TEXT,
  date_received TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON project_documents(project_id);

-- Recreate or ensure project_reviews table
CREATE TABLE IF NOT EXISTS project_reviews (
  review_id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(project_id) ON DELETE CASCADE,
  reviewer_email TEXT,
  health_status TEXT,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_reviews_project_id ON project_reviews(project_id);

-- Recreate or ensure document_folders table  
CREATE TABLE IF NOT EXISTS document_folders (
  folder_id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_folders_project_id ON document_folders(project_id);

-- Recreate or ensure checklists table
CREATE TABLE IF NOT EXISTS checklists (
  checklist_id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checklists_project_id ON checklists(project_id);

COMMIT;
