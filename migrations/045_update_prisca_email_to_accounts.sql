-- Migration: Update Prisca Sibanda's email address
-- Updates Prisca's email from prisca@immigrationspecialists.co.za to accounts@immigrationspecialists.co.za
-- This allows her to approve payments using the accounts email

UPDATE employees 
SET work_email = 'accounts@immigrationspecialists.co.za',
    updated_at = now()
WHERE full_name = 'Prisca Sibanda' 
  AND work_email = 'prisca@immigrationspecialists.co.za';

-- Verify the update
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM employees WHERE work_email = 'accounts@immigrationspecialists.co.za' AND role = 'accountant') THEN
    RAISE NOTICE 'Successfully updated Prisca Sibanda email to accounts@immigrationspecialists.co.za';
  ELSE
    RAISE WARNING 'Email update may have failed - please verify';
  END IF;
END $$;
