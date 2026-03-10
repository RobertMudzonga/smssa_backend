const db = require('../db');
(async()=>{
  try{
    console.log('Checking projects existence...');
    const exists = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') as exists");
    console.log('exists:', exists.rows[0]);
    const cnt = await db.query("SELECT count(*) FROM projects");
    console.log('projects count:', cnt.rows[0]);
    process.exit(0);
  }catch(err){ console.error('ERROR', err); process.exit(1);} 
})();
