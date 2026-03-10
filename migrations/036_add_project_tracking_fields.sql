-- 036_add_project_tracking_fields.sql
-- Add tracking and submission fields to projects table for managing project lifecycle

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS submission_status TEXT,
  ADD COLUMN IF NOT EXISTS submission_type TEXT,
  ADD COLUMN IF NOT EXISTS submission_center TEXT,
  ADD COLUMN IF NOT EXISTS submission_date DATE,
  ADD COLUMN IF NOT EXISTS visa_ref TEXT,
  ADD COLUMN IF NOT EXISTS vfs_receipt TEXT,
  ADD COLUMN IF NOT EXISTS receipt_number TEXT,
  ADD COLUMN IF NOT EXISTS task_introduction_done BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS task_supervisor_reviewed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS final_outcome TEXT;
