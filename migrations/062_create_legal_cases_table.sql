-- Migration: Create Legal Cases Module
-- Handles three case types: Overstay Appeal, Prohibited Persons (V-list), High Court/Expedition

-- ============================================================================
-- MAIN LEGAL CASES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_cases (
    case_id SERIAL PRIMARY KEY,
    case_reference VARCHAR(50) UNIQUE NOT NULL,
    case_type VARCHAR(50) NOT NULL CHECK (case_type IN ('overstay_appeal', 'prohibited_persons', 'high_court_expedition')),
    case_title TEXT NOT NULL,
    case_status VARCHAR(30) DEFAULT 'active' CHECK (case_status IN ('active', 'closed', 'lost', 'settled', 'appealing', 'on_hold')),
    
    -- Client Information
    client_id INTEGER REFERENCES prospects(prospect_id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    
    -- Assignment
    assigned_attorney_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    assigned_paralegal_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    
    -- Workflow State
    current_step INTEGER DEFAULT 1,
    current_step_name TEXT,
    step_history JSONB DEFAULT '[]',
    workflow_data JSONB DEFAULT '{}',
    
    -- Appeal tracking (for Prohibited Persons)
    appeal_count INTEGER DEFAULT 0,
    parent_case_id INTEGER REFERENCES legal_cases(case_id) ON DELETE SET NULL,
    
    -- Time tracking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    closed_at TIMESTAMP,
    
    -- Constraints and deadlines
    constraints JSONB DEFAULT '[]',
    next_deadline TIMESTAMP,
    
    -- Additional metadata
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    notes TEXT,
    tags TEXT[] DEFAULT '{}'
);

-- ============================================================================
-- APPEAL RECORDS TABLE (For Prohibited Persons recursive loop)
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_case_appeals (
    appeal_id SERIAL PRIMARY KEY,
    parent_case_id INTEGER NOT NULL REFERENCES legal_cases(case_id) ON DELETE CASCADE,
    child_case_id INTEGER REFERENCES legal_cases(case_id) ON DELETE SET NULL,
    appeal_number INTEGER NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    outcome VARCHAR(20) CHECK (outcome IN ('success', 'lost', NULL)),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STEP TRANSITIONS LOG (Audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_case_transitions (
    transition_id SERIAL PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES legal_cases(case_id) ON DELETE CASCADE,
    from_step INTEGER,
    to_step INTEGER NOT NULL,
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    performed_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, -- 'advance', 'outcome_set', 'appeal_triggered', 'settlement', 'complete'
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_legal_cases_case_type ON legal_cases(case_type);
CREATE INDEX idx_legal_cases_case_status ON legal_cases(case_status);
CREATE INDEX idx_legal_cases_case_reference ON legal_cases(case_reference);
CREATE INDEX idx_legal_cases_client_id ON legal_cases(client_id);
CREATE INDEX idx_legal_cases_assigned_attorney ON legal_cases(assigned_attorney_id);
CREATE INDEX idx_legal_cases_assigned_paralegal ON legal_cases(assigned_paralegal_id);
CREATE INDEX idx_legal_cases_parent_case ON legal_cases(parent_case_id);
CREATE INDEX idx_legal_cases_next_deadline ON legal_cases(next_deadline);
CREATE INDEX idx_legal_cases_created_at ON legal_cases(created_at);
CREATE INDEX idx_legal_case_appeals_parent ON legal_case_appeals(parent_case_id);
CREATE INDEX idx_legal_case_transitions_case ON legal_case_transitions(case_id);
CREATE INDEX idx_legal_case_transitions_date ON legal_case_transitions(created_at);

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_legal_case_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legal_cases_updated_at ON legal_cases;
CREATE TRIGGER trg_legal_cases_updated_at
    BEFORE UPDATE ON legal_cases
    FOR EACH ROW
    EXECUTE FUNCTION update_legal_case_timestamp();

-- ============================================================================
-- VIEW: Legal Cases with Attorney/Paralegal Names
-- ============================================================================

CREATE OR REPLACE VIEW legal_cases_view AS
SELECT 
    lc.*,
    ea.full_name AS assigned_attorney_name,
    ep.full_name AS assigned_paralegal_name,
    (SELECT COUNT(*) FROM legal_case_appeals WHERE parent_case_id = lc.case_id) AS total_appeals
FROM legal_cases lc
LEFT JOIN employees ea ON lc.assigned_attorney_id = ea.id
LEFT JOIN employees ep ON lc.assigned_paralegal_id = ep.id;

-- ============================================================================
-- SAMPLE DATA COMMENT (for reference)
-- ============================================================================

-- Step configurations by case type:
--
-- OVERSTAY APPEAL (overstay_appeal):
-- 1. Reach Out to Client
-- 2. Prepare Application (Drafting)
-- 3. Submit Application (Email Submissions action)
-- 4. Follow ups with DHA
-- 5. Outcome
--
-- PROHIBITED PERSONS (prohibited_persons):
-- 1. Reach Out to Client
-- 2. Prepare Application (Drafting)
-- 3. Submission
-- 4. Follow ups with DHA
-- 5. Outcome (Success -> Closed, Lost -> Trigger Appeal)
--
-- HIGH COURT/EXPEDITION (high_court_expedition):
-- 1. Letter of Demand (14-day notification period constraint)
-- 2. Founding Affidavit (Drafting)
-- 3. Commissioner of Oaths
-- 4. Issuing at the High Court
-- 5. Sheriff
-- 6. Return of Service
-- 7. Settlement / Agreement (If settled -> ends, else proceed to step 8)
-- 8. High Court
-- 9. Complete
