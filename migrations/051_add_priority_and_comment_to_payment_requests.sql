-- Migration: Add priority and comment fields to payment_requests table
-- Replace is_urgent boolean with tiered priority levels and add requester comments

DO $$
BEGIN
    -- Add priority column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'priority'
    ) THEN
        ALTER TABLE payment_requests 
        ADD COLUMN priority VARCHAR(20) DEFAULT 'Medium Priority' 
        CHECK (priority IN ('High Priority', 'Medium Priority', 'Low Priority'));
    END IF;

    -- Add comment column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'comment'
    ) THEN
        ALTER TABLE payment_requests ADD COLUMN comment TEXT;
    END IF;

    -- Migrate existing is_urgent data to priority if is_urgent column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'is_urgent'
    ) THEN
        UPDATE payment_requests 
        SET priority = 'High Priority' 
        WHERE is_urgent = TRUE AND priority = 'Medium Priority';
        
        -- Drop the is_urgent column after migration
        ALTER TABLE payment_requests DROP COLUMN is_urgent;
    END IF;
END $$;
