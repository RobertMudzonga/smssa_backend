const db = require('./db');
(async () => {
  try {
    const r = await db.query('SELECT stage_id, name FROM prospect_stages ORDER BY stage_id');
    console.log('Prospect stages:');
    r.rows.forEach(row => console.log(`  ${row.stage_id}: ${row.name}`));
  } catch (e) {
    console.error('Error fetching prospect_stages:', e);
  } finally {
    await db.pool.end();
  }
})();
