const db = require('../db');

(async () => {
  const payload = {
    project_name: 'API No Visa',
    client_name: 'NoVisa Client',
    client_email: 'novisa@example.com',
    start_date: new Date().toISOString().split('T')[0],
    payment_amount: 50
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

    if (existingCols.includes('visa_type_id') && !fields.includes('visa_type_id')) {
      const vtRes = await db.query('SELECT visa_type_id FROM visa_types ORDER BY visa_type_id LIMIT 1');
      if (vtRes.rows.length > 0) {
        fields.push('visa_type_id');
        values.push(vtRes.rows[0].visa_type_id);
      } else {
        const ins = await db.query("INSERT INTO visa_types (name) VALUES ($1) RETURNING visa_type_id", ['Default']);
        fields.push('visa_type_id');
        values.push(ins.rows[0].visa_type_id);
      }
    }

    console.log('Fields:', fields);
    console.log('Values:', values);
    const q = `INSERT INTO projects (${fields.join(',')}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`;
    console.log('SQL:', q);
    const res = await db.query(q, values);
    console.log('Inserted OK:', res.rows[0]);
  } catch (err) {
    console.error('Simulated API insert failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
