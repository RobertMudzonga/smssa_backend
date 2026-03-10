-- 017_create_visa_types_table.sql
-- Creates the visa_types table to store visa categories referenced by projects.

CREATE TABLE IF NOT EXISTS visa_types (
  visa_type_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert common visa types from the dropdown
INSERT INTO visa_types (name) VALUES
  ('Visitors Visa 11(1)'),
  ('Visitors Visa Extension'),
  ('Critical Skills Work Visa'),
  ('Critical Skills Visa - Zim Submission'),
  ('Accompanying Dependent (Spouse)'),
  ('Spouse Visa'),
  ('General Work Visa'),
  ('Waiver Application'),
  ('Visitor''s Visa Section 11(1)'),
  ('Visitor''s Visa Section 11(1)(b)(ii)'),
  ('Visitor''s Visa Section 11(1)(b)(iii)'),
  ('Visitor''s Visa Section 11(1)(b)(iv)'),
  ('Visitor''s Visa Section 11(2)'),
  ('Relatives Visa'),
  ('Study Visa'),
  ('Retired Person Visa'),
  ('Business Visa'),
  ('Appeal i.t.o. section 8(4) & 8(6)'),
  ('Permanent Residence Permit'),
  ('Overstay Appeal'),
  ('Legalisation (Good Cause)'),
  ('Prohibition Upliftment'),
  ('Medical Visa'),
  ('LEGALISATION'),
  ('Expedition of Pending')
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_visa_types_name ON visa_types(name);
