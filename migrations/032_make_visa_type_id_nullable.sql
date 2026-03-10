-- 032_make_visa_type_id_nullable.sql
-- Make visa_type_id nullable since not all projects require a specific visa type during import

ALTER TABLE projects
  ALTER COLUMN visa_type_id DROP NOT NULL;
