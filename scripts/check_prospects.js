const db = require('../db');
const leadId = process.argv[2] || 1;

(async () => {
  try {
    const res = await db.query('SELECT * FROM prospects WHERE lead_id = $1 ORDER BY created_at DESC', [leadId]);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Query error:', err);
    process.exit(2);
  } finally {
    process.exit(0);
  }
})();
