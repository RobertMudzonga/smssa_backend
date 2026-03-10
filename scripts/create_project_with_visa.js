const db = require('../db');

(async () => {
  try {
    // Ensure visa_types exists; if not, create a minimal table
    const existsRes = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='visa_types') as exists");
    const visaTableExists = existsRes.rows[0] && existsRes.rows[0].exists;

    if (!visaTableExists) {
      console.log('visa_types table not found — creating a minimal visa_types table');
      await db.query('CREATE TABLE IF NOT EXISTS visa_types (visa_type_id SERIAL PRIMARY KEY, name TEXT)');
    }

    // Get or create a visa type
    let visaRes = await db.query('SELECT visa_type_id FROM visa_types LIMIT 1');
    let visaTypeId;
    if (visaRes.rows.length > 0) visaTypeId = visaRes.rows[0].visa_type_id;
    else {
      const r = await db.query("INSERT INTO visa_types (name) VALUES ($1) RETURNING visa_type_id", ['TestVisa']);
      visaTypeId = r.rows[0].visa_type_id;
    }

    // Insert a project using required visa_type_id and supply common non-null fields
    const today = new Date().toISOString().split('T')[0];
    const insert = await db.query(
      'INSERT INTO projects (project_name, client_name, client_email, visa_type_id, current_stage, start_date, payment_amount) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      ['Inserted Project', 'Inserted Client', 'insert@example.com', visaTypeId, 1, today, 0]
    );

    console.log('Inserted project:', JSON.stringify(insert.rows[0], null, 2));
  } catch (err) {
    console.error('Failed to create project:', err.message || err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
