-- Migration: Create Corporate Clients Table
-- Purpose: Store corporate client information for multi-tenant case management

CREATE TABLE IF NOT EXISTS corporate_clients (
    corporate_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    company_registration_number VARCHAR(100),
    industry VARCHAR(100),
    address TEXT,
    contact_person_name VARCHAR(255),
    contact_person_email VARCHAR(255),
    contact_person_phone VARCHAR(50),
    primary_contact_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    access_token VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    subscription_status VARCHAR(50) DEFAULT 'active' CHECK (subscription_status IN ('active', 'suspended', 'cancelled')),
    max_users INTEGER DEFAULT 10,
    subscription_start DATE,
    subscription_end DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_corporate_clients_name ON corporate_clients(name);
CREATE INDEX idx_corporate_clients_access_token ON corporate_clients(access_token);
CREATE INDEX idx_corporate_clients_is_active ON corporate_clients(is_active);
CREATE INDEX idx_corporate_clients_subscription_status ON corporate_clients(subscription_status);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_corporate_clients_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_corporate_clients_timestamp ON corporate_clients;
CREATE TRIGGER trigger_update_corporate_clients_timestamp
    BEFORE UPDATE ON corporate_clients
    FOR EACH ROW
    EXECUTE FUNCTION update_corporate_clients_timestamp();
