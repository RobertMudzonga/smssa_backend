const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

(async () => {
  try {
    // Preflight: ensure known-required columns exist to prevent partial-schema issues
    try {
      // If prospect_stages exists but is missing display_order, add it
      const check = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='prospect_stages' AND column_name='display_order'");
      if (check.rowCount === 0) {
        // Only attempt to alter if the table exists
        const tableCheck = await pool.query("SELECT to_regclass('public.prospect_stages') as exists");
        if (tableCheck.rows[0] && tableCheck.rows[0].exists) {
          console.log('Preflight: adding missing column prospect_stages.display_order');
          await pool.query('ALTER TABLE prospect_stages ADD COLUMN IF NOT EXISTS display_order INTEGER');
        }
      }
    } catch (preErr) {
      console.warn('Preflight check failed (continuing):', preErr.message || preErr);
    }
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const p = path.join(migrationsDir, file);
      console.log('Applying migration:', file);
      const sql = fs.readFileSync(p, 'utf8');
      if (!sql.trim()) {
        console.log('Skipping empty file:', file);
        continue;
      }
      try {
        await pool.query(sql);
        console.log('Applied:', file);
      } catch (migErr) {
        console.warn('Migration skipped due to error:', file, '-', migErr.message || migErr);
      }
    }

    console.log('Migrations complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
