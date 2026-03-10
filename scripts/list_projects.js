const db = require('../db');

(async () => {
  try {
    const res = await db.query('SELECT project_id, project_name, client_name, client_email, created_at FROM projects ORDER BY created_at DESC LIMIT 10');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error listing projects:', err.message || err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
