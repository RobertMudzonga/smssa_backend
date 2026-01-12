-- Migration: Update Robert's department to IT
-- Robert is the Super Admin with IT department tag

UPDATE employees SET department = 'IT' WHERE full_name = 'Robert Mudzonga';
