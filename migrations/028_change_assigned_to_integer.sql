-- Migration: Change assigned_to from TEXT to INTEGER to match employee IDs
-- This allows proper filtering by salesperson

-- Only run conversion if the column is still TEXT type
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'prospects' 
        AND column_name = 'assigned_to' 
        AND data_type = 'text'
    ) THEN
        -- First, convert any text values to NULL if they can't be cast to integer
        UPDATE prospects SET assigned_to = NULL 
        WHERE assigned_to IS NOT NULL 
        AND assigned_to !~ '^[0-9]+$';
        
        -- Change the column type to INTEGER
        ALTER TABLE prospects ALTER COLUMN assigned_to TYPE INTEGER USING assigned_to::INTEGER;
    END IF;
END $$;
