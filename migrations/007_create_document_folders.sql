-- Migration: create document_folders table to track folders per project
CREATE TABLE IF NOT EXISTS document_folders (
  folder_id SERIAL PRIMARY KEY,
  project_id INTEGER,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_document_folders_project_id ON document_folders (project_id);
