const db = require('./db');
db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name ILIKE '%project%'")
  .then(r => {
    console.log(JSON.stringify(r.rows.map(row => row.table_name), null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
