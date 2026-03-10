-- Create client portal access table with password support
CREATE TABLE IF NOT EXISTS client_portal_access (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  access_token TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_accessed_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add password_hash column if table exists but column doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'client_portal_access' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE client_portal_access ADD COLUMN password_hash TEXT;
  END IF;
END $$;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_client_portal_access_project_id 
  ON client_portal_access (project_id);

CREATE INDEX IF NOT EXISTS idx_client_portal_access_token 
  ON client_portal_access (access_token);

CREATE INDEX IF NOT EXISTS idx_client_portal_access_active 
  ON client_portal_access (is_active);
