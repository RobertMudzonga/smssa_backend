-- Migration: Add view_all_data permission to Salome
-- This allows Salome to see all employees on the employees board

-- Add view_all_data permission to Salome (employee_id = 7)
INSERT INTO employee_permissions (employee_id, permission) 
VALUES (7, 'view_all_data')
ON CONFLICT (employee_id, permission) DO NOTHING;

COMMENT ON TABLE employee_permissions IS 'Stores granular permissions for employees beyond their base role';
