# SMSSA Backend

Server-side API and data layer for the SMSSA CRM and project tracking system.

Tech stack
- Node.js + Express
- PostgreSQL (raw SQL migrations in /migrations)

Repository layout (important folders)
- `server.js` — application entrypoint
- `db.js` — database connection helper
- `migrations/` — ordered SQL migration files
- `lib/` — helper modules (email, scheduler, importers)
- `scripts/` — utility scripts (import, data fixes)

Prerequisites
- Node.js >= 16
- PostgreSQL
- (optional) AWS credentials for S3 uploads and SMTP for email

Environment
Create a `.env` file in `smssa_backend/` with your local settings. Typical variables:
- `DATABASE_URL` — Postgres connection string
- `PORT` — server port (default 5000)
- `JWT_SECRET` — auth signing secret (if used)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` — if S3 is used
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — for outgoing mail

If you need exact variable names, check `server.js` and the modules in `lib/`.

Quickstart (local)
1. Install dependencies

```bash
cd smssa_backend
npm install
```

2. Run migrations

- Preferred: use the included migration runner

```bash
npm run migrate
```

- Or apply SQL files manually (ordered) with `psql`:

```bash
psql <YOUR_CONN_STRING> -f migrations/001_create_prospects_and_leads_converted.sql
# then apply subsequent files in numeric order
```

3. Start the server

```bash
# development with auto-reload (nodemon)
npm run dev

# or production mode
npm start
```

Health checks and quick tests
- There are lightweight test scripts in the repo (files starting with `test-*.js`) — run them with `node` for quick checks.

Notes on the database
- All schema changes are in `migrations/` and are numbered. Review them before applying to production.

Deployment
- Provide environment variables on the host (Docker, systemd, cloud provider) and run `npm start` or use a process manager (PM2, systemd).

Useful scripts (from `package.json`)
- `npm run dev` — nodemon server (development)
- `npm start` — run `server.js` (production)
- `npm run migrate` — run the migration script

Contributing
- Follow existing SQL migration patterns when modifying schema.
- Add small, focused commits and include migration files where schema changes are required.

Where to look next
- API handlers are in the root and `lib/`; start reading `server.js`, `db.js`, and `migrations/` to understand data flow.

Questions
- If anything is unclear, open an issue or contact the original author for environment specifics.
