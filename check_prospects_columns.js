const db = require('./db');

(async () => {
  try {
    const r = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'prospects' ORDER BY ordinal_position`);
    console.log('Prospects table columns:');
    r.rows.forEach(c => console.log('  -', c.column_name));
  } catch(e) {
    console.error(e);
  } finally {
    await db.pool.end();
  }
})();
