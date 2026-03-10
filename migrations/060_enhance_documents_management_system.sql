-- Migration: Comprehensive Document Management System
-- Adds features for: version control, check-in/out, document profiling, access sharing, and full-text search

-- 1. Add new columns to documents table for enhanced management
ALTER TABLE documents ADD COLUMN IF NOT EXISTS unique_doc_id TEXT UNIQUE DEFAULT generate_unique_doc_id();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available'; -- available, checked_out, archived, expired
ALTER TABLE documents ADD COLUMN IF NOT EXISTS checked_out_by TEXT; -- who has it checked out
ALTER TABLE documents ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMP;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS check_in_due_date DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Create document_versions table for version control
CREATE TABLE IF NOT EXISTS document_versions (
  version_id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT,
  size BIGINT,
  content BYTEA,
  file_hash TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  change_description TEXT,
  UNIQUE(document_id, version_number)
);

-- 3. Create document_access_shares table for external sharing
CREATE TABLE IF NOT EXISTS document_access_shares (
  share_id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,
  shared_by TEXT NOT NULL,
  shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  permission_type TEXT DEFAULT 'view', -- view, download, edit
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  client_email TEXT -- optional: specific client email restriction
);

-- 4. Create document_activity_log table for audit trail
CREATE TABLE IF NOT EXISTS document_activity_log (
  activity_id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- uploaded, updated, checked_out, checked_in, deleted, shared, downloaded, viewed
  performed_by TEXT,
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  details JSONB,
  ip_address TEXT
);

-- 5. Create document_categories table for organization
CREATE TABLE IF NOT EXISTS document_categories (
  category_id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(project_id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, category_name)
);

-- 6. Create document_profiles table to store document metadata
CREATE TABLE IF NOT EXISTS document_profiles (
  profile_id SERIAL PRIMARY KEY,
  document_id INTEGER UNIQUE NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
  title TEXT,
  author TEXT,
  subject TEXT,
  keywords TEXT,
  content_summary TEXT,
  language TEXT DEFAULT 'en',
  pages INTEGER,
  created_date DATE,
  last_modified_date DATE,
  classification TEXT, -- public, internal, confidential, restricted
  retention_period_months INTEGER,
  is_template BOOLEAN DEFAULT FALSE,
  template_variables JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Add GIN index for full-text search on document content
CREATE INDEX IF NOT EXISTS idx_documents_content_fulltext ON documents 
  USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- 8. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_created_at ON document_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_document_access_shares_document_id ON document_access_shares(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_shares_token ON document_access_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_document_activity_log_document_id ON document_activity_log(document_id);
CREATE INDEX IF NOT EXISTS idx_document_activity_log_performed_at ON document_activity_log(performed_at);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_project_id_status ON documents(project_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_unique_doc_id ON documents(unique_doc_id);
CREATE INDEX IF NOT EXISTS idx_document_categories_project_id ON document_categories(project_id);

-- 9. Create function to update document updated_at timestamp
CREATE OR REPLACE FUNCTION update_document_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for documents table
DROP TRIGGER IF EXISTS documents_updated_at_trigger ON documents;
CREATE TRIGGER documents_updated_at_trigger
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_document_updated_at();

-- 10. Create function to generate unique document ID
CREATE OR REPLACE FUNCTION generate_unique_doc_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'DOC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((random()*999999)::int::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 11. Create function for full-text search
CREATE OR REPLACE FUNCTION search_documents(
  search_query TEXT,
  p_project_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  document_id INTEGER,
  name TEXT,
  project_name TEXT,
  description TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.document_id,
    d.name,
    d.project_name,
    d.description,
    similarity(d.name || ' ' || COALESCE(d.description, ''), search_query) as similarity
  FROM documents d
  WHERE (p_project_id IS NULL OR d.project_id = p_project_id)
    AND (d.name ILIKE '%' || search_query || '%' 
         OR d.description ILIKE '%' || search_query || '%'
         OR d.project_name ILIKE '%' || search_query || '%')
  ORDER BY similarity DESC, d.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- 12. Add comment on key columns
COMMENT ON COLUMN documents.status IS 'Document status: available (can be checked out), checked_out (in use), archived (no longer active), expired (past expiry date)';
COMMENT ON COLUMN documents.unique_doc_id IS 'Auto-generated unique identifier for each document (DOC-YYYYMMDD-XXXXXX)';
COMMENT ON COLUMN document_access_shares.permission_type IS 'Type of access granted: view (read-only), download (with download), edit (modifications allowed)';
COMMENT ON COLUMN document_profiles.classification IS 'Document classification level: public (available to all), internal (employees only), confidential (restricted access), restricted (limited to specific users)';
