-- 010_create_appraisals_table.sql
CREATE TABLE IF NOT EXISTS appraisals (
  appraisal_id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  reviewer_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  review_date DATE NOT NULL,
  review_period TEXT NOT NULL,
  rating TEXT,
  key_achievements TEXT,
  development_goals TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appraisals_employee_period ON appraisals(employee_id, review_period);
CREATE INDEX IF NOT EXISTS idx_appraisals_review_period ON appraisals(review_period);
