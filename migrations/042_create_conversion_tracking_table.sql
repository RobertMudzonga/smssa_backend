-- Migration: Create conversion_tracking table for employee performance reporting
-- This table tracks when prospects are marked as won/converted

CREATE TABLE IF NOT EXISTS conversion_tracking (
    conversion_id SERIAL PRIMARY KEY,
    prospect_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    conversion_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quote_amount NUMERIC(12,2),
    deal_name TEXT,
    stage_id INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conversion_prospect FOREIGN KEY (prospect_id) 
        REFERENCES prospects(prospect_id) ON DELETE CASCADE,
    CONSTRAINT fk_conversion_employee FOREIGN KEY (employee_id) 
        REFERENCES employees(id) ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversion_tracking_employee_id 
    ON conversion_tracking (employee_id);
CREATE INDEX IF NOT EXISTS idx_conversion_tracking_prospect_id 
    ON conversion_tracking (prospect_id);
CREATE INDEX IF NOT EXISTS idx_conversion_tracking_conversion_date 
    ON conversion_tracking (conversion_date);

-- Create a unique constraint to prevent duplicate conversions
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_tracking_unique_prospect 
    ON conversion_tracking (prospect_id);

COMMENT ON TABLE conversion_tracking IS 'Tracks prospect conversions for employee performance reporting';
COMMENT ON COLUMN conversion_tracking.conversion_date IS 'When the prospect was marked as won';
COMMENT ON COLUMN conversion_tracking.quote_amount IS 'Final quote amount at time of conversion';
COMMENT ON COLUMN conversion_tracking.deal_name IS 'Deal name at time of conversion';
