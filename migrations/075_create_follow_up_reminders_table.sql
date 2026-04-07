-- Create follow_up_reminders table for prospect/lead follow-up reminders
CREATE TABLE IF NOT EXISTS follow_up_reminders (
    reminder_id SERIAL PRIMARY KEY,
    prospect_id INTEGER,
    lead_id INTEGER,
    entity_type VARCHAR(20) NOT NULL, -- 'prospect' or 'lead'
    assigned_user_id INTEGER NOT NULL,
    assigned_user_email VARCHAR(255) NOT NULL,
    reminder_date DATE NOT NULL,
    note_content TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'completed'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_by INTEGER,
    updated_at TIMESTAMP,
    CONSTRAINT fk_prospect FOREIGN KEY (prospect_id) REFERENCES prospects(prospect_id) ON DELETE CASCADE,
    CONSTRAINT fk_lead FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
    CONSTRAINT fk_assigned_user FOREIGN KEY (assigned_user_id) REFERENCES employees(id) ON DELETE RESTRICT,
    CONSTRAINT chk_entity_type CHECK (entity_type IN ('prospect', 'lead')),
    CONSTRAINT chk_status CHECK (status IN ('pending', 'sent', 'completed')),
    CONSTRAINT chk_entity_exists CHECK (
        (entity_type = 'prospect' AND prospect_id IS NOT NULL AND lead_id IS NULL) OR
        (entity_type = 'lead' AND lead_id IS NOT NULL AND prospect_id IS NULL)
    )
);

-- Create index for efficient querying of upcoming reminders
CREATE INDEX idx_follow_up_reminders_date_status ON follow_up_reminders(reminder_date, status);
CREATE INDEX idx_follow_up_reminders_user_id ON follow_up_reminders(assigned_user_id);
CREATE INDEX idx_follow_up_reminders_prospect_id ON follow_up_reminders(prospect_id);
CREATE INDEX idx_follow_up_reminders_lead_id ON follow_up_reminders(lead_id);
