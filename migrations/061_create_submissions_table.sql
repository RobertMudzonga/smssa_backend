-- Migration: Create Project Submissions Table
-- Allows project managers to track manual submissions with submission dates and types

-- Create submissions table
CREATE TABLE IF NOT EXISTS submissions (
  submission_id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(project_id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  submission_type TEXT NOT NULL, -- e.g., "Application", "Documentation", "Payment", "Status Update", "Review", "Other"
  submission_date DATE NOT NULL, -- When the project will be submitted
  submitted_by TEXT NOT NULL, -- User/Project Manager who created the submission
  status TEXT DEFAULT 'pending', -- pending, submitted, approved, rejected
  notes TEXT, -- Additional notes/comments
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scheduled_for_date DATE, -- The actual date it needs to be submitted
  client_name TEXT,
  assigned_user_id INTEGER
);

-- Create index for faster queries
CREATE INDEX idx_submissions_project_id ON submissions(project_id);
CREATE INDEX idx_submissions_submission_date ON submissions(submission_date);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_submitted_by ON submissions(submitted_by);
