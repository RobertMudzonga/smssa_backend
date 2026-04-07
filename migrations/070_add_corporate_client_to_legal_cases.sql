-- Migration: Add Corporate Client Support to Legal Cases
-- Purpose: Link legal cases to corporate clients for multi-tenant management

-- Add corporate_client_id to legal_cases
ALTER TABLE legal_cases 
ADD COLUMN corporate_client_id INTEGER REFERENCES corporate_clients(corporate_id) ON DELETE CASCADE;

-- Add index for faster queries
CREATE INDEX idx_legal_cases_corporate_client ON legal_cases(corporate_client_id);

-- Create junction table for corporate client employees
CREATE TABLE IF NOT EXISTS corporate_client_employees (
    corporate_client_employee_id SERIAL PRIMARY KEY,
    corporate_client_id INTEGER NOT NULL REFERENCES corporate_clients(corporate_id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'case_manager' CHECK (role IN ('admin', 'case_manager', 'viewer')),
    can_create_cases BOOLEAN DEFAULT true,
    can_edit_cases BOOLEAN DEFAULT true,
    can_delete_cases BOOLEAN DEFAULT false,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(corporate_client_id, employee_id)
);

-- Add indexes
CREATE INDEX idx_corporate_client_employees_corporate_id ON corporate_client_employees(corporate_client_id);
CREATE INDEX idx_corporate_client_employees_employee_id ON corporate_client_employees(employee_id);
CREATE INDEX idx_corporate_client_employees_role ON corporate_client_employees(role);

-- Create view for corporate client case management
CREATE OR REPLACE VIEW v_corporate_case_management AS
SELECT 
    lc.case_id,
    lc.case_reference,
    lc.case_type,
    lc.case_title,
    lc.case_status,
    lc.client_name,
    lc.client_email,
    lc.priority,
    lc.current_step,
    lc.next_deadline,
    lc.created_at,
    cc.corporate_id,
    cc.name AS corporate_name,
    em.id AS assigned_manager_id,
    em.full_name AS assigned_manager_name
FROM legal_cases lc
LEFT JOIN corporate_clients cc ON lc.corporate_client_id = cc.corporate_id
LEFT JOIN employees em ON lc.assigned_case_manager_id = em.id
WHERE lc.corporate_client_id IS NOT NULL;

-- Add comment to document the relationship
COMMENT ON COLUMN legal_cases.corporate_client_id IS 'References the corporate client this case belongs to for multi-tenant management';
COMMENT ON TABLE corporate_client_employees IS 'Tracks which employees have access to which corporate clients and their permissions';
