-- Migration: Add contact_people JSONB to corporate_clients
BEGIN;

ALTER TABLE corporate_clients
ADD COLUMN IF NOT EXISTS contact_people JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN corporate_clients.contact_people IS 'Array of contact objects: [{"name":"","email":"","phone":"","role":""}]';

COMMIT;
