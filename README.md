# SMSSA Backend Setup Instructions

## Database Migrations

Before running the backend, you need to apply the database migrations to add the necessary columns to the prospects table.

### Step 1: Connect to your PostgreSQL database

```bash
psql -U your_username -d your_database_name
```

### Step 2: Run the migration scripts in order

```bash
# First migration - creates prospects table and adds converted flag to leads
\i migrations/001_create_prospects_and_leads_converted.sql

# Second migration - adds stage tracking to prospects
\i migrations/002_add_prospect_stage_tracking.sql
```

Alternatively, you can run the SQL directly:

```sql
-- Add current_stage_id to prospects table (defaults to stage 1 = Opportunity)
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS current_stage_id INTEGER DEFAULT 1;

-- Add updated_at timestamp
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add notes field for prospect details
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index on current_stage_id for faster filtering
CREATE INDEX IF NOT EXISTS idx_prospects_stage_id ON prospects (current_stage_id);
```

### Step 3: Start the backend server

```bash
npm install
npm start
```

The backend will run on http://localhost:5000

## API Endpoints

### Prospects

- `GET /api/prospects` - List all prospects with stage information
- `POST /api/prospects` - Create a new prospect (automatically set to "Opportunity" stage)
- `PATCH /api/prospects/:id/stage` - Update prospect stage

### Leads

- `GET /api/leads` - List all leads
- `PATCH /api/leads/:id/stage` - Update lead stage
- `POST /api/leads/webhook` - Webhook endpoint for external lead sources
- `POST /api/leads/:id/convert` - Convert a lead to a prospect

## Frontend Configuration

The frontend is configured to connect to the backend API at `http://localhost:5000/api`.

Make sure both the frontend and backend are running:

1. Backend: `npm start` (in smssa-backend folder)
2. Frontend: `npm run dev` (in main project folder)

## Deployment / Frontend env

- **REACT_APP_API_BASE**: When building the frontend for production, set the environment variable `REACT_APP_API_BASE` to the base URL of the deployed backend (for example `https://my-backend.onrender.com`). The frontend will make requests to `REACT_APP_API_BASE + '/api/...'`.

- Example (Vercel): In your project settings -> Environment Variables add `REACT_APP_API_BASE` for the `Production` and `Preview` environments and redeploy the site.

- Quick test against backend:

```bash
curl -X POST "https://your-backend.onrender.com/api/auth/signup" -H "Content-Type: application/json" -d '{"email":"you@immigrationspecialists.co.za","password":"yourpass"}'
```
