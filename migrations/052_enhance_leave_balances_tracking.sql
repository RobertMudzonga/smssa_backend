-- Enhance leave_balances table to better track leave accrual and reset dates
-- This migration improves the tracking of leave balance per employee per year
-- Rule: 1.5 days on Jan 1, 18 days by Dec 31 (0.0452 days per calendar day)

-- Add new columns to track earned days, reset date, and month-based accrual
ALTER TABLE leave_balances 
ADD COLUMN IF NOT EXISTS days_earned DECIMAL(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS accrual_rate DECIMAL(5,2) DEFAULT 1.5;

-- Update existing records with reset date if not already set
UPDATE leave_balances 
SET reset_date = DATE_TRUNC('year', CURRENT_DATE)::DATE
WHERE reset_date IS NULL;

-- Add a function to calculate leave days accrued by the current date
-- Base: 1.5 days at start of year (Jan 1)
-- Rate: 16.5 days accrued over 365 days = 0.0452 per day
-- Max: 18 days by end of year (Dec 31)
CREATE OR REPLACE FUNCTION get_accrued_leave_for_date(employee_id INTEGER, check_date DATE)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  year_start DATE;
  days_elapsed INTEGER;
  accrued DECIMAL(5,2);
  base_days DECIMAL(5,2) := 1.5;
  daily_rate DECIMAL(5,2) := 0.0452; -- 16.5 days over 365 days
BEGIN
  -- Get the start of the year
  year_start := DATE_TRUNC('year', check_date)::DATE;
  
  -- Calculate days elapsed in the year
  days_elapsed := check_date - year_start;
  
  -- Calculate accrued days: 1.5 base + (0.0452 * days_elapsed)
  -- Capped at 18 days maximum
  accrued := LEAST(base_days + (daily_rate * days_elapsed), 18.00);
  
  RETURN ROUND(accrued::NUMERIC, 2);
END;
$$ LANGUAGE plpgsql;

-- Create function to get current leave balance for an employee
CREATE OR REPLACE FUNCTION get_current_leave_balance(employee_id INTEGER)
RETURNS TABLE(
  balance_id INTEGER,
  emp_id INTEGER,
  balance_year INTEGER,
  accrued DECIMAL(5,2),
  used DECIMAL(5,2),
  remaining DECIMAL(5,2),
  is_negative BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lb.id,
    lb.employee_id,
    lb.year,
    get_accrued_leave_for_date(lb.employee_id, CURRENT_DATE) as accrued,
    COALESCE(lb.days_used, 0) as used,
    GREATEST(get_accrued_leave_for_date(lb.employee_id, CURRENT_DATE) - COALESCE(lb.days_used, 0), -999) as remaining,
    (get_accrued_leave_for_date(lb.employee_id, CURRENT_DATE) - COALESCE(lb.days_used, 0)) < 0 as is_negative
  FROM leave_balances lb
  WHERE lb.employee_id = $1 AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Create index for faster lookup of balances by employee and year
CREATE INDEX IF NOT EXISTS idx_leave_balances_year ON leave_balances(year);
