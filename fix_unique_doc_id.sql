-- Fix unique_doc_id default value
ALTER TABLE documents ALTER COLUMN unique_doc_id SET DEFAULT (generate_unique_doc_id());

-- Update any existing rows that have NULL unique_doc_id
UPDATE documents 
SET unique_doc_id = generate_unique_doc_id() 
WHERE unique_doc_id IS NULL;
