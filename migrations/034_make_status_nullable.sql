-- 034_make_status_nullable.sql
-- Make status nullable since not all projects have a status during import
-- Status will be set to a default value by the backend if not provided

ALTER TABLE projects
  ALTER COLUMN status DROP NOT NULL;
