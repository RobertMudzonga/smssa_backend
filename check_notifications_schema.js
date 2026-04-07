const db = require('./db');
db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'notifications'")
  .then(r => {
    console.log(JSON.stringify(r.rows, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
