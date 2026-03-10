const db = require('./db');

async function checkSalome() {
  try {
    const result = await db.query(
      "SELECT id, full_name, work_email, job_position, role, is_active FROM employees WHERE full_name ILIKE '%Salome%' OR full_name ILIKE '%Nemalale%'"
    );
    console.log('Found employees:', JSON.stringify(result.rows, null, 2));
    
    // Also check all employees
    const allResult = await db.query('SELECT id, full_name, is_active, role FROM employees ORDER BY full_name');
    console.log('\n\nAll employees:');
    allResult.rows.forEach(emp => {
      console.log(`- ${emp.full_name} (ID: ${emp.id}, Active: ${emp.is_active}, Role: ${emp.role})`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkSalome();
