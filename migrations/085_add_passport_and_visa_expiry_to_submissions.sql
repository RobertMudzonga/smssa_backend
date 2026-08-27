-- Add applicant identity and visa expiry details to project submissions.
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS passport_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS current_visa_expiry_date DATE;