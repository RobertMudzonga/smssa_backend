const db = require('../db');
(async()=>{
  try{
    const r = await db.query('SELECT 1 as ok');
    console.log('PING OK:', r.rows);
    process.exit(0);
  }catch(err){ console.error('PING ERROR:', err); process.exit(1);} 
})();
