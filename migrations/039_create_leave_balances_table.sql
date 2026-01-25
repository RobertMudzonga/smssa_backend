-- Create leave_balances table to track employee leave day accruals
-- Rule: Employees start with 1.5 days at the beginning of the year
-- and accrue to 13 days by the end of the year (11.5 days accrued over 12 months)

CREATE TABLE IF NOT EXISTS leave_balances (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_days_allocated DECIMAL(5,2) DEFAULT 13.00,
  days_used DECIMAL(5,2) DEFAULT 0.00,
  days_remaining DECIMAL(5,2) DEFAULT 13.00,
  last_accrual_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, year)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_year ON leave_balances(employee_id, year);

-- Create a function to calculate accrued leave days for a given date
-- Rule: Start with 1.5 days on Jan 1, accrue 0.958333 days per month (11.5/12)
-- to reach 13 days by Dec 31
CREATE OR REPLACE FUNCTION calculate_accrued_leave_days(check_date DATE)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  year_start DATE;
  year_end DATE;
  days_elapsed INTEGER;
  days_in_year INTEGER;
  accrued_days DECIMAL(5,2);
  base_days DECIMAL(5,2) := 1.5;
  year_end_days DECIMAL(5,2) := 13.00;
  accrual_amount DECIMAL(5,2);
BEGIN
  -- Get the start and end of the year
  year_start := DATE_TRUNC('year', check_date);
  year_end := year_start + INTERVAL '1 year' - INTERVAL '1 day';
  
  -- Calculate days elapsed in the year
  days_elapsed := check_date - year_start;
  days_in_year := year_end - year_start + 1;
  
  -- Calculate the accrual amount
  accrual_amount := year_end_days - base_days;
  
  -- Calculate accrued days: start with 1.5, add proportional accrual based on days elapsed
  accrued_days := base_days + (accrual_amount * days_elapsed / days_in_year);
  
  -- Round to 2 decimal places
  RETURN ROUND(accrued_days, 2);
END;
$$ LANGUAGE plpgsql;

-- Initialize leave balances for all active employees for the current year
INSERT INTO leave_balances (employee_id, year, total_days_allocated, days_used, days_remaining, last_accrual_date)
SELECT 
  id, 
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  13.00,
  0.00,
  calculate_accrued_leave_days(CURRENT_DATE),
  CURRENT_DATE
FROM employees
WHERE is_active = true
ON CONFLICT (employee_id, year) DO NOTHING;
