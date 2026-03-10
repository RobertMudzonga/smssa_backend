-- 013_create_projects_table.sql
-- Creates the projects table used by the app. Idempotent when run multiple times.

CREATE TABLE IF NOT EXISTS projects (
  project_id SERIAL PRIMARY KEY,
  client_lead_id INTEGER,
  visa_type_id INTEGER,
  assigned_user_id INTEGER,
  project_name TEXT,
  current_stage INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optionally create a simple index to support lookups by client_lead_id
CREATE INDEX IF NOT EXISTS idx_projects_client_lead_id ON projects(client_lead_id);
