-- 080_add_clerk_id_to_employees.sql
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS clerk_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_clerk_id_unique
ON employees (clerk_id)
WHERE clerk_id IS NOT NULL;
