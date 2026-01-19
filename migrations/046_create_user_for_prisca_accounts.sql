-- Migration: Create user account for Prisca Sibanda (accounts@immigrationspecialists.co.za)
-- This allows Prisca to log in and approve payment requests

-- Only insert if the user doesn't already exist
-- Using a placeholder hash that will need to be reset via /auth/register
INSERT INTO users (email, password_hash, password_salt, created_at)
SELECT 
    'accounts@immigrationspecialists.co.za',
    'PLACEHOLDER_NEEDS_RESET',
    'PLACEHOLDER',
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'accounts@immigrationspecialists.co.za'
);

-- Verify the user was created
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE email = 'accounts@immigrationspecialists.co.za') THEN
    RAISE NOTICE 'User account created for accounts@immigrationspecialists.co.za';
    RAISE NOTICE 'IMPORTANT: User must complete registration via /auth/register to set password';
  ELSE
    RAISE WARNING 'User account creation may have failed - please verify';
  END IF;
END $$;
