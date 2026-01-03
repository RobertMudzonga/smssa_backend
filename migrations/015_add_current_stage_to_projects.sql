-- 015_add_current_stage_to_projects.sql
-- Adds current_stage column to projects table if missing

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_stage INTEGER DEFAULT 1;
