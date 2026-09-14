-- Migration: Add request_type field to payment_requests table
-- Categorizes payment requests into 'disbursement', 'operational', or 'refund'

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'request_type'
    ) THEN
        ALTER TABLE payment_requests 
        ADD COLUMN request_type VARCHAR(50) DEFAULT 'disbursement';
    END IF;
END $$;

-- Set existing records with NULL request_type to 'disbursement'
UPDATE payment_requests SET request_type = 'disbursement' WHERE request_type IS NULL;

-- Create index on request_type for quick tab filtering
CREATE INDEX IF NOT EXISTS idx_payment_requests_request_type ON payment_requests(request_type);
