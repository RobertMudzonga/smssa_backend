-- Migration: Add project payment tracking columns
-- Tracks payment_amount as the quote, payment_received as amount paid, and remaining_balance as unpaid amount
-- payment_status tracks whether the balance is pending, partially_paid, or fully_paid

ALTER TABLE IF EXISTS projects
ADD COLUMN IF NOT EXISTS payment_received NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';

-- Create an index on payment_status for filtering
CREATE INDEX IF NOT EXISTS idx_projects_payment_status ON projects(payment_status);

-- Create an index on payment_received for analytics
CREATE INDEX IF NOT EXISTS idx_projects_payment_received ON projects(payment_received);

-- Add comment to payment_amount to clarify it's the quote/invoice amount
COMMENT ON COLUMN projects.payment_amount IS 'Total project quote/invoice amount';
COMMENT ON COLUMN projects.payment_received IS 'Amount of payment already received';
COMMENT ON COLUMN projects.remaining_balance IS 'Amount still outstanding (payment_amount - payment_received)';
COMMENT ON COLUMN projects.payment_status IS 'Payment status: pending, partially_paid, fully_paid';

-- Trigger to automatically update remaining_balance and payment_status when payment_received changes
CREATE OR REPLACE FUNCTION update_project_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate remaining balance
  NEW.remaining_balance = COALESCE(NEW.payment_amount, 0) - COALESCE(NEW.payment_received, 0);
  
  -- Update payment status
  IF NEW.payment_amount IS NULL OR NEW.payment_amount = 0 THEN
    NEW.payment_status = 'pending';
  ELSIF NEW.payment_received >= NEW.payment_amount THEN
    NEW.payment_status = 'fully_paid';
  ELSIF NEW.payment_received > 0 THEN
    NEW.payment_status = 'partially_paid';
  ELSE
    NEW.payment_status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists (to avoid conflicts)
DROP TRIGGER IF EXISTS update_project_balance_trigger ON projects;

-- Create the trigger
CREATE TRIGGER update_project_balance_trigger
BEFORE INSERT OR UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION update_project_balance();

-- Initialize remaining_balance for existing records where payment_amount is set
UPDATE projects 
SET remaining_balance = COALESCE(payment_amount, 0) - COALESCE(payment_received, 0)
WHERE remaining_balance = 0 AND payment_amount > 0;

-- Initialize payment_status for existing records
UPDATE projects
SET payment_status = 'pending'
WHERE payment_status = 'pending' AND payment_amount > 0;
