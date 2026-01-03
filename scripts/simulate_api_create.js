const db = require('../db');

(async () => {
  const payload = {
    project_name: 'Sim API',
    client_name: 'Sim Client',
    client_email: 'sim@example.com',
    visa_type_id: 1,
    start_date: new Date().toISOString().split('T')[0],
    payment_amount: 0
  };

  try {
    const colRes = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
    const existingCols = colRes.rows.map(r => r.column_name);
    const allowed = ['project_name','client_name','client_email','case_type','priority','start_date','payment_amount','client_id','status','progress','visa_type_id','current_stage','assigned_user_id','assigned_manager_id'];

    const fields = [];
    const values = [];
    for (const k of allowed) {
      if (typeof payload[k] !== 'undefined' && existingCols.includes(k)) {
        fields.push(k);
        values.push(payload[k]);
      }
    }

    console.log('Fields to insert:', fields);
    console.log('Values:', values);

    if (fields.length === 0) {
      console.log('Nothing to insert — would echo back');
      process.exit(0);
    }

    const q = `INSERT INTO projects (${fields.join(',')}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`;
    console.log('SQL:', q);

    const res = await db.query(q, values);
    console.log('Insert result:', res.rows[0]);
  } catch (err) {
    console.error('Insert error:', err.message || err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
