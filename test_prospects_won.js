const db = require('./db');

(async () => {
  try {
    // Test query to ensure prospects table is accessible
    const prospects = await db.query(`SELECT prospect_id, first_name, last_name, current_stage_id, assigned_to FROM prospects LIMIT 3`);
    console.log('Sample prospects:');
    prospects.rows.forEach(p => console.log(`  ID ${p.prospect_id}: ${p.first_name} ${p.last_name}, Stage: ${p.current_stage_id}, Assigned to: ${p.assigned_to}`));
    
    // Test employee metrics columns
    const employees = await db.query(`SELECT id, full_name, conversions_count, total_revenue FROM employees WHERE is_active = TRUE LIMIT 3`);
    console.log('\nSample employees with metrics:');
    employees.rows.forEach(e => console.log(`  ${e.full_name}: ${e.conversions_count} conversions, $${e.total_revenue}`));
  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    await db.pool.end();
  }
})();
