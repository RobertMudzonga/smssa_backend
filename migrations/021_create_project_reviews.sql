-- 021_create_project_reviews.sql
-- Creates project_reviews table for internal supervisor reviews/comments on project health.

BEGIN;

CREATE TABLE IF NOT EXISTS project_reviews (
  review_id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  reviewer_email TEXT NOT NULL,
  health_status TEXT, -- e.g., Green, Amber, Red
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK to projects if possible (defensive in case schema differs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') THEN
    -- Try add FK; ignore if fails (different PK name)
    BEGIN
      ALTER TABLE project_reviews
        ADD CONSTRAINT project_reviews_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    WHEN invalid_column_reference THEN
      NULL;
    WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_reviews_project_id ON project_reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_project_reviews_created_at ON project_reviews(created_at);

COMMIT;
