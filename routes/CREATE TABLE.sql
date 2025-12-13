CREATE TABLE prospects (
  prospect_id SERIAL PRIMARY KEY,
  lead_id INTEGER,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  source TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);