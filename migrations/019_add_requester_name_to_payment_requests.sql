-- Add requester_name column to payment_requests table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_requests' AND column_name = 'requester_name'
    ) THEN
        ALTER TABLE payment_requests ADD COLUMN requester_name VARCHAR(255);
        UPDATE payment_requests SET requester_name = 'Unknown' WHERE requester_name IS NULL;
        ALTER TABLE payment_requests ALTER COLUMN requester_name SET NOT NULL;
    END IF;
END $$;
