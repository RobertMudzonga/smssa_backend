-- Create work calendar items table for employee task requests
CREATE TABLE IF NOT EXISTS work_calendar_items (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT,
  requested_for_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_by_email TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_calendar_items_date ON work_calendar_items(requested_for_date);
CREATE INDEX IF NOT EXISTS idx_work_calendar_items_employee_id ON work_calendar_items(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_calendar_items_status ON work_calendar_items(status);
