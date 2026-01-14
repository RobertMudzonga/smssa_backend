-- Migration: Add is_super_admin field to employees table
-- This allows super admin status to be managed in the database instead of hardcoded

-- Add is_super_admin boolean field to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- Set Robert and Munya as super admins
UPDATE employees 
SET is_super_admin = TRUE 
WHERE work_email IN ('robert@immigrationspecialists.co.za', 'munya@immigrationspecialists.co.za');

-- Add comment for clarity
COMMENT ON COLUMN employees.is_super_admin IS 'Indicates if the employee has super admin privileges with full system access';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_employees_is_super_admin ON employees(is_super_admin) WHERE is_super_admin = TRUE;
