-- Migration: Create Employee Visa Tracking Table
-- Purpose: Track foreign employee visa information and expiry dates for corporate clients

CREATE TABLE IF NOT EXISTS employee_visas (
    visa_id SERIAL PRIMARY KEY,
    corporate_client_id INTEGER NOT NULL REFERENCES corporate_clients(corporate_id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    employee_email VARCHAR(255),
    employee_phone VARCHAR(50),
    passport_number VARCHAR(100),
    
    -- Visa Information
    visa_type_id INTEGER REFERENCES visa_types(visa_type_id) ON DELETE SET NULL,
    visa_type_name TEXT,
    visa_number VARCHAR(100),
    visa_issue_date DATE,
    visa_expiry_date DATE NOT NULL,
    country_of_issue VARCHAR(100),
    
    -- Employment Details
    position_title TEXT,
    department TEXT,
    employment_start_date DATE,
    employment_end_date DATE,
    
    -- Status & Tracking
    status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'renewed', 'cancelled', 'pending_renewal')),
    days_until_expiry INTEGER,
    
    -- Renewal & Compliance
    renewal_alert_sent_at TIMESTAMP,
    renewal_notes TEXT,
    document_reference TEXT,
    
    -- Audit Trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES employees(id) ON DELETE SET NULL
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_employee_visas_corporate_client ON employee_visas(corporate_client_id);
CREATE INDEX idx_employee_visas_expiry_date ON employee_visas(visa_expiry_date);
CREATE INDEX idx_employee_visas_status ON employee_visas(status);
CREATE INDEX idx_employee_visas_employee_email ON employee_visas(employee_email);
CREATE INDEX idx_employee_visas_visa_type ON employee_visas(visa_type_id);

-- Index for finding visas expiring soon (must be in separate query, not in CREATE TABLE)
-- This will be created after table setup via application

-- ============================================================================
-- TRIGGER TO UPDATE UPDATED_AT TIMESTAMP AND RECALCULATE DAYS_UNTIL_EXPIRY
-- ============================================================================

CREATE OR REPLACE FUNCTION update_employee_visas_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.days_until_expiry = CAST((NEW.visa_expiry_date - CURRENT_DATE) AS INTEGER);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_visas_updated_at
BEFORE UPDATE ON employee_visas
FOR EACH ROW
EXECUTE FUNCTION update_employee_visas_timestamp();

-- Trigger to set days_until_expiry on insert as well
CREATE OR REPLACE FUNCTION set_employee_visas_days_until_expiry()
RETURNS TRIGGER AS $$
BEGIN
    NEW.days_until_expiry = CAST((NEW.visa_expiry_date - CURRENT_DATE) AS INTEGER);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_visas_insert
BEFORE INSERT ON employee_visas
FOR EACH ROW
EXECUTE FUNCTION set_employee_visas_days_until_expiry();

-- ============================================================================
-- VIEW FOR VISA EXPIRY ALERTS
-- ============================================================================

CREATE OR REPLACE VIEW v_visa_expiry_alerts AS
SELECT 
    ev.visa_id,
    ev.corporate_client_id,
    cc.name as company_name,
    ev.employee_name,
    ev.employee_email,
    ev.visa_type_name,
    ev.visa_expiry_date,
    ev.days_until_expiry,
    CASE 
        WHEN ev.days_until_expiry < 0 THEN 'EXPIRED'
        WHEN ev.days_until_expiry <= 7 THEN 'CRITICAL'
        WHEN ev.days_until_expiry <= 30 THEN 'URGENT'
        WHEN ev.days_until_expiry <= 90 THEN 'DUE_SOON'
        ELSE 'OK'
    END as alert_level
FROM employee_visas ev
LEFT JOIN corporate_clients cc ON ev.corporate_client_id = cc.corporate_id
WHERE ev.status = 'active'
ORDER BY ev.visa_expiry_date ASC;
