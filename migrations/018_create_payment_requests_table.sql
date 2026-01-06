-- Migration: Create payment_requests table
-- This table stores payment requests submitted by users and approved/paid by finance

CREATE TABLE IF NOT EXISTS payment_requests (
    payment_request_id SERIAL PRIMARY KEY,
    requested_by INTEGER REFERENCES users(user_id),
    requester_name VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    description TEXT NOT NULL,
    due_date DATE NOT NULL,
    is_urgent BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, paid
    approved_by INTEGER REFERENCES users(user_id),
    approved_at TIMESTAMP,
    paid_by INTEGER REFERENCES users(user_id),
    paid_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_requested_by ON payment_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_payment_requests_due_date ON payment_requests(due_date);
