-- Migration: Create payment_requests table
-- This table stores payment requests submitted by users and approved/paid by finance

CREATE TABLE IF NOT EXISTS payment_requests (
    payment_request_id SERIAL PRIMARY KEY,
    requested_by INTEGER REFERENCES users(id),
    requester_name VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT NOT NULL,
    due_date DATE NOT NULL,
    is_urgent BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, paid
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    paid_by INTEGER REFERENCES users(id),
    paid_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
-- Create index on requested_by only if the column exists (handles environments where it was removed)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'requested_by'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_payment_requests_requested_by ON payment_requests(requested_by);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_payment_requests_due_date ON payment_requests(due_date);
