-- Migration: Update prospect_stages table with proper sales pipeline stages
-- Fixes issue where prospects jump from Month-End Follow-up (stage 7) directly to Won
-- This ensures proper progression through all 14 stages

-- First, clear the old data
DELETE FROM prospect_stages WHERE stage_id BETWEEN 1 AND 14;

-- Insert the correct 14 prospect stages
INSERT INTO prospect_stages (stage_id, name, display_order, description) VALUES
(1, 'Opportunity', 1, 'Initial opportunity identified'),
(2, 'Quote Requested', 2, 'Quote has been requested by prospect'),
(3, 'Quote Sent', 3, 'Quote sent to prospect'),
(4, 'First Follow-up', 4, 'First follow-up after quote sent'),
(5, 'Second Follow-up', 5, 'Second follow-up after first'),
(6, 'Mid-Month Follow-up', 6, 'Mid-month check-in'),
(7, 'Month-End Follow-up', 7, 'Month-end follow-up'),
(8, 'Next Month Follow-up', 8, 'Follow-up in next month'),
(9, 'Discount Requested', 9, 'Prospect requested a discount'),
(10, 'Quote Accepted', 10, 'Prospect accepted the quote'),
(11, 'Engagement Sent', 11, 'Engagement letter sent to prospect'),
(12, 'Invoice Sent', 12, 'Invoice sent to prospect'),
(13, 'Payment Date Confirmed', 13, 'Payment date has been confirmed'),
(14, 'Won', 14, 'Deal won - convert to client')
ON CONFLICT (stage_id) DO UPDATE SET 
  name = EXCLUDED.name,
  display_order = EXCLUDED.display_order,
  description = EXCLUDED.description;

-- Ensure any prospect with stage_id > 14 is reset to the appropriate stage
-- (This shouldn't happen, but good for data integrity)
UPDATE prospects SET current_stage_id = 14 WHERE current_stage_id > 14;
UPDATE prospects SET current_stage_id = 1 WHERE current_stage_id IS NULL OR current_stage_id <= 0;
