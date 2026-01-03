const db = require('../db');

async function inspect() {
  try {
    const res = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    console.log('users table columns:');
    res.rows.forEach(r => console.log(r.column_name, '-', r.data_type));
  } catch (err) {
    console.error('Error inspecting users table:', err.message || err);
  } finally {
    // End pool to allow process to exit
    if (db.pool && typeof db.pool.end === 'function') {
      db.pool.end().then(() => process.exit(0));
    } else {
      process.exit(0);
    }
  }
}

inspect();
