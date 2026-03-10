-- Migration: Add sales performance tracking to employees table
-- This allows tracking of conversions and revenue for each salesperson

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS conversions_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(10, 2) DEFAULT 0.00;

-- Create index for performance queries
CREATE INDEX IF NOT EXISTS idx_employees_conversions ON employees(conversions_count);
CREATE INDEX IF NOT EXISTS idx_employees_revenue ON employees(total_revenue);

-- Add comments for documentation
COMMENT ON COLUMN employees.conversions_count IS 'Number of prospects converted to won status by this employee';
COMMENT ON COLUMN employees.total_revenue IS 'Total revenue from won prospects assigned to this employee';

-- Initialize counts for existing data
-- This will count all prospects that are currently won (stage 13) for each employee
UPDATE employees e
SET conversions_count = (
    SELECT COUNT(*)
    FROM prospects p
    WHERE p.assigned_to = e.id 
    AND p.current_stage_id = 13
),
total_revenue = (
    SELECT COALESCE(SUM(p.forecast_amount), 0)
    FROM prospects p
    WHERE p.assigned_to = e.id 
    AND p.current_stage_id = 13
    AND p.forecast_amount IS NOT NULL
);
