-- Migration: Add SharePoint Folder URL to Corporate Clients
-- Purpose: Store Microsoft SharePoint folder link for document uploads

ALTER TABLE corporate_clients
ADD COLUMN IF NOT EXISTS sharepoint_folder_url TEXT;

-- Add comment/documentation
COMMENT ON COLUMN corporate_clients.sharepoint_folder_url IS 'Microsoft SharePoint folder URL where corporate clients upload documents instead of direct app uploads';
