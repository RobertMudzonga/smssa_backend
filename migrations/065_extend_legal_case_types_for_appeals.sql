-- Migration: Extend legal case types for Appeals 8(4) and Appeals 8(6)

ALTER TABLE legal_cases
DROP CONSTRAINT IF EXISTS legal_cases_case_type_check;

ALTER TABLE legal_cases
ADD CONSTRAINT legal_cases_case_type_check CHECK (
    case_type IN (
        'overstay_appeal',
        'prohibited_persons',
        'high_court_expedition',
        'appeals_8_4',
        'appeals_8_6'
    )
);
