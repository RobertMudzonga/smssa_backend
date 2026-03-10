-- Create leave_balances table to track employee leave day accruals
-- Rule: Employees start with 1.5 days at the beginning of the year
-- and accrue to 18 days by the end of the year
-- Milestones: 1.5 days by Jan 31, 3 days by Feb 28, 18 days by Dec 31

CREATE TABLE IF NOT EXISTS leave_balances (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_days_allocated DECIMAL(5,2) DEFAULT 18.00,
  days_used DECIMAL(5,2) DEFAULT 0.00,
  days_remaining DECIMAL(5,2) DEFAULT 18.00,
  last_accrual_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, year)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_year ON leave_balances(employee_id, year);

-- Create a function to calculate accrued leave days for a given date
-- Stepped accrual:
-- - Jan 1-31: 1.5 days (base)
-- - Feb 1-28: 1.5 to 3 days (0.0536 per day)
-- - Mar 1-Dec 31: 3 to 18 days (0.0492 per day)
CREATE OR REPLACE FUNCTION calculate_accrued_leave_days(check_date DATE)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  year_start DATE;
  february_end DATE;
  march_start DATE;
  days_in_february INTEGER;
  days_in_march_onwards INTEGER;
  accrued_days DECIMAL(5,2);
BEGIN
  -- Get the dates
  year_start := DATE_TRUNC('year', check_date)::DATE;
  february_end := (year_start + INTERVAL '1 month' + INTERVAL '27 days')::DATE;
  march_start := (year_start + INTERVAL '2 months')::DATE;
  
  -- Start with base 1.5 days
  accrued_days := 1.5;
  
  -- If past Feb 28, accrue from 3 to 18 days over Mar 1 to Dec 31
  IF check_date > february_end THEN
    days_in_march_onwards := check_date - march_start;
    -- 305 days to accrue 15 days = 0.0492 per day
    accrued_days := LEAST(3.0 + (days_in_march_onwards * 0.0492), 18.00);
  -- If in February, accrue from 1.5 to 3 days
  ELSIF check_date > (year_start + INTERVAL '30 days')::DATE THEN
    days_in_february := check_date - (year_start + INTERVAL '31 days')::DATE;
    -- 28 days to accrue 1.5 days = 0.0536 per day
    accrued_days := LEAST(1.5 + (days_in_february * 0.0536), 3.00);
  END IF;
  
  RETURN ROUND(accrued_days, 2);
END;
$$ LANGUAGE plpgsql;

-- Initialize leave balances for all active employees for the current year
INSERT INTO leave_balances (employee_id, year, total_days_allocated, days_used, days_remaining, last_accrual_date)
SELECT 
  id, 
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  18.00,
  0.00,
  calculate_accrued_leave_days(CURRENT_DATE),
  CURRENT_DATE
FROM employees
WHERE is_active = true
ON CONFLICT (employee_id, year) DO NOTHING;
