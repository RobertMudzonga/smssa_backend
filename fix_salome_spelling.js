const db = require('./db');

async function fixSpelling() {
  try {
    console.log('Updating Salome Namalale to Salome Nemalale...');
    const result = await db.query(
      "UPDATE employees SET full_name = 'Salome Nemalale' WHERE full_name = 'Salome Namalale'"
    );
    console.log('Updated:', result.rowCount, 'row(s)');
    
    const verify = await db.query(
      "SELECT id, full_name, work_email, job_position FROM employees WHERE full_name LIKE '%Nemalale%'"
    );
    console.log('Verified:', JSON.stringify(verify.rows, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixSpelling();
