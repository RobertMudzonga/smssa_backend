const db = require('./db');

(async () => {
  try {
    // Check employees table columns
    const r = await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'employees' AND column_name IN ('conversions_count', 'total_revenue') ORDER BY column_name`);
    console.log('Employee metrics columns:');
    r.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));
    
    // Check sample data
    const employees = await db.query(`SELECT id, full_name, conversions_count, total_revenue FROM employees WHERE is_active = TRUE LIMIT 5`);
    console.log('\nSample employee metrics:');
    employees.rows.forEach(e => console.log(`  ${e.full_name}: ${e.conversions_count} conversions, $${e.total_revenue} revenue`));
  } catch(e) {
    console.error(e);
  } finally {
    await db.pool.end();
  }
})();
