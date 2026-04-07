const db = require('./db');

(async () => {
  try {
    const result = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'follow_up_reminders'
    `);
    
    if (result.rows.length > 0) {
      console.log('✓ follow_up_reminders table exists');
      
      // Get column info
      const cols = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'follow_up_reminders'
        ORDER BY ordinal_position
      `);
      console.log('\nColumns:');
      cols.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });
    } else {
      console.log('✗ follow_up_reminders table NOT found');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
