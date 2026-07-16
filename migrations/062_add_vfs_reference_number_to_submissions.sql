-- Migration: Add VFS Reference Number to Submissions Table
-- Adds vfs_reference_number field to track VFS reference numbers for visa submissions

ALTER TABLE submissions
ADD COLUMN vfs_reference_number VARCHAR(255);

-- Create index for faster queries
CREATE INDEX idx_submissions_vfs_reference_number ON submissions(vfs_reference_number);
