-- Migration 022: Create leads table for cold lead management
-- This table stores leads from webhooks/forms that are in the cold funnel
-- before they are converted to prospects

CREATE TABLE IF NOT EXISTS leads (
    lead_id SERIAL PRIMARY KEY,
    
    -- Contact information
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    
    -- Lead source tracking
    source VARCHAR(100) DEFAULT 'Manual',
    source_id VARCHAR(255),  -- External ID from form/webhook
    form_id VARCHAR(255),    -- Form name/ID from submission
    
    -- Stage tracking
    current_stage_id INTEGER REFERENCES prospect_stages(stage_id),
    cold_lead_stage INTEGER,  -- 101-104 for cold lead stages
    
    -- Status
    converted BOOLEAN DEFAULT FALSE,
    assigned_user_id INTEGER REFERENCES users(id),
    
    -- Notes and activity log
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_cold_lead_stage ON leads(cold_lead_stage);
CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads(converted);
-- Create index on assigned_user_id only if column exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'leads' AND column_name = 'assigned_user_id') THEN
        CREATE INDEX IF NOT EXISTS idx_leads_assigned_user ON leads(assigned_user_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at DESC);

-- Add unique constraint on email where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email_unique ON leads(LOWER(email)) WHERE email IS NOT NULL;

COMMENT ON TABLE leads IS 'Cold leads from webhooks/forms before conversion to prospects';
COMMENT ON COLUMN leads.cold_lead_stage IS 'Cold funnel stages: 101=First Contact, 102=Follow-up, 103=Qualified, 104=Ready';
COMMENT ON COLUMN leads.current_stage_id IS 'Optional prospect pipeline stage if moved before formal conversion';
COMMENT ON COLUMN leads.source IS 'Lead source: Webhook, Zapier, Manual, etc.';
COMMENT ON COLUMN leads.notes IS 'Activity log and comments, timestamped entries';
