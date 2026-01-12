-- 033_make_start_date_nullable.sql
-- Make start_date nullable since not all projects have a start date during import

ALTER TABLE projects
  ALTER COLUMN start_date DROP NOT NULL;
