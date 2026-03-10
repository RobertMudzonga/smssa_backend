const db = require('../db');
const table = process.argv[2];
if (!table) { console.error('Usage: node inspect_table_clean.js <table_name>'); process.exit(1); }
(async ()=>{
  try{
    console.log('Inspecting table:', table);
    const r = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table]);
    console.log('Query returned rows:', (r.rows||[]).length);
    console.log(JSON.stringify(r.rows, null, 2));
    process.exit(0);
  }catch(err){ console.error(err); process.exit(1);} 
})();
