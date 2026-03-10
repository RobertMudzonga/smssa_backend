-- Migration: allow storing uploader emails as text instead of integer IDs
-- The documents routes now pass user emails (e.g., from x-user-email header).
-- Converting the column to TEXT prevents failures like "invalid input syntax for type integer".

ALTER TABLE documents
  ALTER COLUMN uploaded_by TYPE TEXT USING uploaded_by::text;
