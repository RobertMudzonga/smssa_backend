const db = require('./db');
async function run() {
  try {
    // Clean up test data first
    await db.query("DELETE FROM legal_case_transitions");
    await db.query("DELETE FROM legal_case_appeals");
    await db.query("DELETE FROM legal_cases");
    console.log('Cleaned up test legal cases data');
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
