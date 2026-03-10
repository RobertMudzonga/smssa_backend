-- Enhance leave_balances table to better track leave accrual and reset dates
-- This migration improves the tracking of leave balance per employee per year
-- Milestones: 1.5 days by Jan 31, 3 days by Feb 28, 18 days by Dec 31

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
-- Stepped accrual:
-- - Jan 1-31: 1.5 days
-- - Feb 1-28: 1.5 to 3 days (0.0536 per day)
-- - Mar 1-Dec 31: 3 to 18 days (0.0492 per day)
CREATE OR REPLACE FUNCTION get_accrued_leave_for_date(employee_id INTEGER, check_date DATE)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  year_start DATE;
  february_end DATE;
  march_start DATE;
  days_in_february INTEGER;
  days_in_march_onwards INTEGER;
  accrued DECIMAL(5,2);
BEGIN
  -- Get the dates
  year_start := DATE_TRUNC('year', check_date)::DATE;
  february_end := (year_start + INTERVAL '1 month' + INTERVAL '27 days')::DATE;
  march_start := (year_start + INTERVAL '2 months')::DATE;
  
  -- Start with base 1.5 days
  accrued := 1.5;
  
  -- If past Feb 28, accrue from 3 to 18 days over Mar 1 to Dec 31
  IF check_date > february_end THEN
    days_in_march_onwards := check_date - march_start;
    -- 305 days to accrue 15 days = 0.0492 per day
    accrued := LEAST(3.0 + (days_in_march_onwards * 0.0492), 18.00);
  -- If in February, accrue from 1.5 to 3 days
  ELSIF check_date > (year_start + INTERVAL '30 days')::DATE THEN
    days_in_february := check_date - (year_start + INTERVAL '31 days')::DATE;
    -- 28 days to accrue 1.5 days = 0.0536 per day
    accrued := LEAST(1.5 + (days_in_february * 0.0536), 3.00);
  END IF;
  
  RETURN ROUND(accrued, 2);
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
