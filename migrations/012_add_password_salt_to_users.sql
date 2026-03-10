-- Add password_salt column to users table if it doesn't exist
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_salt TEXT;

-- Ensure updated_at column exists (safe no-op if present)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- No-op index changes; keep migration idempotent
-- End of migration
