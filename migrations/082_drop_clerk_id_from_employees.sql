-- 082_drop_clerk_id_from_employees.sql
-- Clerk integration was removed from the app; this column is no longer used.
DROP INDEX IF EXISTS idx_employees_clerk_id_unique;

ALTER TABLE employees
DROP COLUMN IF EXISTS clerk_id;
