-- 009_create_employees_table.sql
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  work_email TEXT NOT NULL UNIQUE,
  job_position TEXT NOT NULL,
  department TEXT,
  manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
