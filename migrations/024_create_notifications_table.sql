-- Migration 024: Create notifications table for in-app notifications
-- This table stores notifications for employees about lead assignments and other events

CREATE TABLE IF NOT EXISTS notifications (
    notification_id SERIAL PRIMARY KEY,
    
    -- Recipient
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    
    -- Notification content
    type VARCHAR(50) NOT NULL, -- 'lead_assigned', 'lead_converted', etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    
    -- Related entity (optional)
    related_entity_type VARCHAR(50), -- 'lead', 'prospect', 'project', etc.
    related_entity_id INTEGER,
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_employee ON notifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_employee_unread ON notifications(employee_id, is_read) WHERE is_read = FALSE;

COMMENT ON TABLE notifications IS 'In-app notifications for employees';
COMMENT ON COLUMN notifications.type IS 'Type of notification for filtering and display';
COMMENT ON COLUMN notifications.related_entity_type IS 'Type of related entity (lead, prospect, etc)';
COMMENT ON COLUMN notifications.related_entity_id IS 'ID of the related entity';
