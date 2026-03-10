-- Add fields to leave_requests table to track paid/unpaid status and days taken
-- Rule: If employee doesn't have enough leave days, the leave automatically becomes unpaid

ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS days_requested DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS days_paid DECIMAL(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS days_unpaid DECIMAL(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS is_fully_paid BOOLEAN DEFAULT true;

-- Update existing records to calculate days_requested
UPDATE leave_requests
SET days_requested = CASE 
  WHEN end_date IS NOT NULL AND start_date IS NOT NULL 
  THEN EXTRACT(DAY FROM (end_date::timestamp - start_date::timestamp)) + 1
  ELSE 1
END
WHERE days_requested IS NULL;

-- Update existing records to set is_fully_paid based on leave type
-- Unpaid leave type should be marked as unpaid
UPDATE leave_requests
SET 
  is_fully_paid = CASE WHEN leave_type = 'unpaid' THEN false ELSE true END,
  days_paid = CASE WHEN leave_type = 'unpaid' THEN 0 ELSE days_requested END,
  days_unpaid = CASE WHEN leave_type = 'unpaid' THEN days_requested ELSE 0 END
WHERE is_fully_paid IS NULL;
