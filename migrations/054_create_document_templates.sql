-- Create document_templates to store reusable document skeletons
CREATE TABLE IF NOT EXISTS document_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure template names are unique per category to avoid duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_category_name
  ON document_templates (category, name);

CREATE INDEX IF NOT EXISTS idx_document_templates_is_active
  ON document_templates (is_active);

CREATE INDEX IF NOT EXISTS idx_document_templates_category
  ON document_templates (category);
