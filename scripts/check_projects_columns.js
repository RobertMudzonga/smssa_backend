const db = require('../db');

(async () => {
  try {
    const res = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' ORDER BY column_name");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error querying columns:', err.message || err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
