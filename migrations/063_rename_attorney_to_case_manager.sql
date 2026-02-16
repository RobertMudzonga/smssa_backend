-- Migration: Rename attorney columns to case_manager
-- This migration renames assigned_attorney_id to assigned_case_manager_id

-- Rename the column in legal_cases table
ALTER TABLE legal_cases 
RENAME COLUMN assigned_attorney_id TO assigned_case_manager_id;

-- Drop the old index and create new one with updated name
DROP INDEX IF EXISTS idx_legal_cases_assigned_attorney;
CREATE INDEX IF NOT EXISTS idx_legal_cases_assigned_case_manager ON legal_cases(assigned_case_manager_id);

-- Drop and recreate the view with updated column name
DROP VIEW IF EXISTS legal_cases_with_staff;

CREATE VIEW legal_cases_with_staff AS
SELECT 
    lc.*,
    ecm.full_name AS assigned_case_manager_name,
    ep.full_name AS assigned_paralegal_name
FROM legal_cases lc
LEFT JOIN employees ecm ON lc.assigned_case_manager_id = ecm.id
LEFT JOIN employees ep ON lc.assigned_paralegal_id = ep.id;

-- Add comment for documentation
COMMENT ON COLUMN legal_cases.assigned_case_manager_id IS 'The employee ID of the assigned case manager';
