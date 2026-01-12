-- Migration: Add employee roles and set up company structure
-- Adds role field to employees and populates the organizational structure

-- Add role field to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'employee';

-- Clear existing employees for clean setup (if any exist)
TRUNCATE TABLE employees RESTART IDENTITY CASCADE;

-- Insert employees in correct order (managers first, then their reports)
-- Super Admin & Overall Manager
INSERT INTO employees (id, full_name, work_email, job_position, department, manager_id, role, is_active) VALUES
(1, 'Robert Mudzonga', 'robert@immigrationspecialists.co.za', 'Super Admin', 'Management', NULL, 'super_admin', TRUE),
(2, 'Munya', 'munya@immigrationspecialists.co.za', 'Overall Manager', 'Management', NULL, 'overall_manager', TRUE);

-- Sales Department
INSERT INTO employees (id, full_name, work_email, job_position, department, manager_id, role, is_active) VALUES
(3, 'Tendai', 'tendai@immigrationspecialists.co.za', 'Sales Manager', 'Sales', 2, 'department_manager', TRUE);

-- Legal Department (Emily is manager)
INSERT INTO employees (id, full_name, work_email, job_position, department, manager_id, role, is_active) VALUES
(4, 'Emily', 'emily@immigrationspecialists.co.za', 'Legal Manager', 'Legal', 2, 'department_manager', TRUE),
(5, 'Takura', 'takura@immigrationspecialists.co.za', 'Legal Officer', 'Legal', 4, 'employee', TRUE),
(6, 'Hapson', 'hapson@immigrationspecialists.co.za', 'Legal Officer', 'Legal', 4, 'employee', TRUE);

-- Projects Department (Salome is primary manager, Emily is also a manager here)
INSERT INTO employees (id, full_name, work_email, job_position, department, manager_id, role, is_active) VALUES
(7, 'Salome', 'salome@immigrationspecialists.co.za', 'Project Manager', 'Projects', 2, 'department_manager', TRUE),
(8, 'Abongile', 'abongile@immigrationspecialists.co.za', 'Project Coordinator', 'Projects', 7, 'employee', TRUE),
(9, 'Phyllis', 'phyllis@immigrationspecialists.co.za', 'Project Coordinator', 'Projects', 7, 'employee', TRUE),
(10, 'Malwande', 'malwande@immigrationspecialists.co.za', 'Project Coordinator', 'Projects', 7, 'employee', TRUE),
(11, 'Victor', 'victor@immigrationspecialists.co.za', 'Project Coordinator', 'Projects', 7, 'employee', TRUE);

-- Accounts Department
INSERT INTO employees (id, full_name, work_email, job_position, department, manager_id, role, is_active) VALUES
(12, 'Prisca Sibanda', 'prisca@immigrationspecialists.co.za', 'Accountant', 'Accounts', 2, 'accountant', TRUE);

-- Reset the sequence to continue from the last ID
SELECT setval('employees_id_seq', (SELECT MAX(id) FROM employees));

-- Add comments for clarity
COMMENT ON COLUMN employees.role IS 'Roles: super_admin, overall_manager, department_manager, accountant, employee';

-- Create permissions mapping table
CREATE TABLE IF NOT EXISTS employee_permissions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant permissions based on roles
-- Robert (Super Admin) - all permissions
INSERT INTO employee_permissions (employee_id, permission) VALUES
(1, 'manage_employees'),
(1, 'manage_projects'),
(1, 'approve_leave_requests'),
(1, 'approve_payment_requests'),
(1, 'review_projects'),
(1, 'manage_leads'),
(1, 'manage_prospects'),
(1, 'view_all_data');

-- Munya (Overall Manager) - approves everything, reviews projects
INSERT INTO employee_permissions (employee_id, permission) VALUES
(2, 'approve_leave_requests'),
(2, 'approve_payment_requests'),
(2, 'review_projects'),
(2, 'manage_projects'),
(2, 'view_all_data');

-- Tendai (Sales Manager)
INSERT INTO employee_permissions (employee_id, permission) VALUES
(3, 'manage_leads'),
(3, 'manage_prospects'),
(3, 'approve_leave_requests');

-- Emily (Legal & Projects Manager)
INSERT INTO employee_permissions (employee_id, permission) VALUES
(4, 'approve_leave_requests'),
(4, 'review_projects'),
(4, 'manage_projects');

-- Salome (Project Manager)
INSERT INTO employee_permissions (employee_id, permission) VALUES
(7, 'approve_leave_requests'),
(7, 'review_projects'),
(7, 'manage_projects');

-- Prisca (Accountant)
INSERT INTO employee_permissions (employee_id, permission) VALUES
(12, 'approve_payment_requests'),
(12, 'view_financial_data');

CREATE INDEX IF NOT EXISTS idx_employee_permissions_employee ON employee_permissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_permissions_permission ON employee_permissions(permission);
