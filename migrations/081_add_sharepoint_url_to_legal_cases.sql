ALTER TABLE legal_cases
    ADD COLUMN IF NOT EXISTS sharepoint_folder_url TEXT;

COMMENT ON COLUMN legal_cases.sharepoint_folder_url IS 'Microsoft SharePoint folder URL used for legal case client uploads';
