-- Migration: Change requester from name to employee_id foreign key
BEGIN;

-- Check if requester_id column already exists; if not, add it
-- Since we cannot use IF NOT EXISTS in ALTER TABLE ADD COLUMN directly,
-- we'll add it as nullable and handle the data
DO $$
BEGIN
  BEGIN
    ALTER TABLE payment_requests ADD COLUMN requester_id INTEGER REFERENCES employees(id);
  EXCEPTION WHEN duplicate_column THEN
    -- Column already exists, do nothing
    NULL;
  END;
END $$;

-- For any existing records with NULL requester_id, set a default
UPDATE payment_requests
SET requester_id = COALESCE(
  (SELECT e.id FROM employees e LIMIT 1),
  1
)
WHERE requester_id IS NULL;

-- Make the column NOT NULL if it isn't already
ALTER TABLE payment_requests
  ALTER COLUMN requester_id SET NOT NULL;

-- Drop the requester_name column if it exists
DO $$
BEGIN
  ALTER TABLE payment_requests DROP COLUMN requester_name;
EXCEPTION WHEN undefined_column THEN
  -- Column doesn't exist, do nothing
  NULL;
END $$;

-- Create index on requester_id for performance
CREATE INDEX IF NOT EXISTS idx_payment_requests_requester_id ON payment_requests(requester_id);

COMMIT;
