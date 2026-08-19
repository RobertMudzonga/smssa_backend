-- Track each visa expiry milestone independently so daily jobs are idempotent.
CREATE TABLE IF NOT EXISTS employee_visa_alerts (
    alert_id SERIAL PRIMARY KEY,
    visa_id INTEGER NOT NULL REFERENCES employee_visas(visa_id) ON DELETE CASCADE,
    alert_days INTEGER NOT NULL CHECK (alert_days IN (180, 150, 120)),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (visa_id, alert_days)
);

CREATE INDEX IF NOT EXISTS idx_employee_visa_alerts_status
    ON employee_visa_alerts(status);
