const db = require('../db');

(async () => {
  try {
    const res = await db.query(
      'INSERT INTO projects (project_name, client_name, client_email) VALUES ($1,$2,$3) RETURNING *',
      ['Direct Insert Test', 'Direct Client', 'direct@example.com']
    );
    console.log('Inserted:', JSON.stringify(res.rows[0], null, 2));
  } catch (err) {
    console.error('Insert failed:', err.message || err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
