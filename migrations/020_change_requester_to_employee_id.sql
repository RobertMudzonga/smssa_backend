-- Migration: Change requester from name to employee_id foreign key
BEGIN;

-- Step 1: Add requester_id column as nullable INTEGER (without constraint yet)
DO $$
BEGIN
  BEGIN
    ALTER TABLE payment_requests ADD COLUMN requester_id INTEGER;
  EXCEPTION WHEN duplicate_column THEN
    -- Column already exists, do nothing
    NULL;
  END;
END $$;

-- Step 2: Populate requester_id with a default employee ID (or NULL if no employees exist)
-- Only update rows where requester_id is still NULL
DO $$
DECLARE
  default_employee_id INTEGER;
BEGIN
  -- Try to get the first employee ID
  SELECT id INTO default_employee_id FROM employees ORDER BY id ASC LIMIT 1;
  
  -- If we found an employee, use it; otherwise use NULL (will be filled manually later)
  IF default_employee_id IS NOT NULL THEN
    UPDATE payment_requests
    SET requester_id = default_employee_id
    WHERE requester_id IS NULL;
  END IF;
END $$;

-- Step 3: Add foreign key constraint (allow NULL for now, can be made NOT NULL later after data is validated)
DO $$
BEGIN
  BEGIN
    ALTER TABLE payment_requests 
    ADD CONSTRAINT fk_payment_requests_requester_id 
    FOREIGN KEY (requester_id) REFERENCES employees(id);
  EXCEPTION WHEN duplicate_object THEN
    -- Constraint already exists, do nothing
    NULL;
  END;
END $$;

-- Step 4: Drop the requester_name column if it exists
DO $$
BEGIN
  ALTER TABLE payment_requests DROP COLUMN requester_name;
EXCEPTION WHEN undefined_column THEN
  -- Column doesn't exist, do nothing
  NULL;
END $$;

-- Step 5: Create index on requester_id for performance
CREATE INDEX IF NOT EXISTS idx_payment_requests_requester_id ON payment_requests(requester_id);

COMMIT;
