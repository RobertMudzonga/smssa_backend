-- Migration: Create Corporate Messages Table
-- Purpose: Store secure communication history between corporate clients and the agency

CREATE TABLE IF NOT EXISTS corporate_messages (
    message_id SERIAL PRIMARY KEY,
    corporate_id INTEGER REFERENCES corporate_clients(corporate_id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES employees(id) ON DELETE SET NULL, -- Null if sent by client
    is_from_client BOOLEAN DEFAULT false,
    message_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_corporate_messages_corporate_id ON corporate_messages(corporate_id);
CREATE INDEX idx_corporate_messages_created_at ON corporate_messages(created_at);
