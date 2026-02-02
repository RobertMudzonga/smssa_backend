-- 059_create_employee_kpis_table.sql
-- KPI tracking for employee performance appraisals

CREATE TABLE IF NOT EXISTS employee_kpis (
  kpi_id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_month DATE NOT NULL, -- First day of the month for the KPI period
  
  -- Performance metrics
  revenue DECIMAL(12,2) DEFAULT 0,
  submissions INTEGER DEFAULT 0,
  approval_rate DECIMAL(5,2) DEFAULT 0, -- Percentage (0-100)
  client_satisfaction_score DECIMAL(3,2) DEFAULT 0, -- 0-5.0 scale
  compliance BOOLEAN DEFAULT true,
  team_score DECIMAL(5,2) DEFAULT 0, -- For senior consultants (0-100)
  
  -- Calculated fields
  kpi_score DECIMAL(5,2) DEFAULT 0, -- Overall weighted score (0-100)
  performance_label VARCHAR(100), -- "Exceeds Expectations", "Meets Expectations", etc.
  commission DECIMAL(12,2) DEFAULT 0,
  
  -- PIP tracking
  pip_flag BOOLEAN DEFAULT false,
  pip_reason TEXT,
  promotion_ready BOOLEAN DEFAULT false,
  
  -- Manager feedback
  manager_notes TEXT,
  reviewer_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(employee_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_employee_kpis_employee ON employee_kpis(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_kpis_period ON employee_kpis(period_month);
CREATE INDEX IF NOT EXISTS idx_employee_kpis_employee_period ON employee_kpis(employee_id, period_month);
CREATE INDEX IF NOT EXISTS idx_employee_kpis_pip_flag ON employee_kpis(pip_flag) WHERE pip_flag = true;

-- Add comment
COMMENT ON TABLE employee_kpis IS 'Stores monthly KPI performance data for employee appraisals with role-based weighted scoring';
