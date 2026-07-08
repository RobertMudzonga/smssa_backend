-- Migration: Add project SharePoint Folder URL
-- Purpose: Allow project records to store a SharePoint folder URL for client document uploads

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS sharepoint_folder_url TEXT;

COMMENT ON COLUMN projects.sharepoint_folder_url IS 'Microsoft SharePoint folder URL used for project client uploads';
