-- Create corporate_permits, permit_steps, and permit_step_notes
BEGIN;

CREATE TABLE IF NOT EXISTS corporate_permits (
  permit_id SERIAL PRIMARY KEY,
  corporate_client_id INTEGER NOT NULL REFERENCES corporate_clients(corporate_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permit_steps (
  permit_step_id SERIAL PRIMARY KEY,
  permit_id INTEGER NOT NULL REFERENCES corporate_permits(permit_id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_by TEXT,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS permit_step_notes (
  note_id SERIAL PRIMARY KEY,
  permit_step_id INTEGER NOT NULL REFERENCES permit_steps(permit_step_id) ON DELETE CASCADE,
  author_name TEXT,
  author_role TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ensure one permit per corporate client
CREATE UNIQUE INDEX IF NOT EXISTS idx_corporate_permits_client_id ON corporate_permits (corporate_client_id);

COMMIT;
