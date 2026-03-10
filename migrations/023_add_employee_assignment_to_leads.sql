-- Migration 023: Add employee assignment to leads for salesperson allocation
-- This allows leads to be assigned to employees (salespeople) instead of just users

-- Drop existing assigned_user_id column if it exists (and its index)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'leads' AND column_name = 'assigned_user_id') THEN
        -- Drop the index first if it exists
        DROP INDEX IF EXISTS idx_leads_assigned_user;
        -- Drop the column
        ALTER TABLE leads DROP COLUMN assigned_user_id;
    END IF;
END $$;

-- Add new column referencing employees table (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'leads' AND column_name = 'assigned_employee_id') THEN
        ALTER TABLE leads ADD COLUMN assigned_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for assignment queries
CREATE INDEX IF NOT EXISTS idx_leads_assigned_employee ON leads(assigned_employee_id);

-- Add timestamp for when lead was assigned (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'leads' AND column_name = 'assigned_at') THEN
        ALTER TABLE leads ADD COLUMN assigned_at TIMESTAMP;
    END IF;
END $$;

COMMENT ON COLUMN leads.assigned_employee_id IS 'Employee (salesperson) this lead is assigned to';
COMMENT ON COLUMN leads.assigned_at IS 'Timestamp when lead was assigned to current employee';
