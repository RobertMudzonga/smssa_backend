-- Migration: Create project payments table for audit trail
-- Optional table to track individual payment records for each project

CREATE TABLE IF NOT EXISTS project_payments (
  payment_id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  amount_received NUMERIC NOT NULL CHECK (amount_received > 0),
  payment_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_project_payments_project_id ON project_payments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_payments_payment_date ON project_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_project_payments_created_at ON project_payments(created_at);

-- Add comment
COMMENT ON TABLE project_payments IS 'Audit trail of individual payments received for projects';
COMMENT ON COLUMN project_payments.amount_received IS 'Amount received in this payment';
COMMENT ON COLUMN project_payments.payment_date IS 'Date the payment was received';
COMMENT ON COLUMN project_payments.notes IS 'Optional notes about the payment (e.g., cheque number, reference)';
