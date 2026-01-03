const db = require('../db');

(async ()=>{
  try{
    const colRes = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
    const existingCols = colRes.rows.map(r=>r.column_name);
    console.log('cols:', existingCols);
    const updates = { current_stage: 2 };
    const allowedFields = [ 'current_stage','task_introduction_done','task_supervisor_reviewed','submission_status','submission_type','submission_center','submission_date','visa_ref','vfs_receipt','receipt_number','tracking_submission_type','tracking_submission_center','tracking_date','tracking_visa_ref','tracking_vfs_receipt','tracking_receipt_number','final_outcome' ];
    const queryParts = [];
    const values = [];
    let counter = 1;
    const mapFieldToColumn = (key)=>{
      if (existingCols.includes(key)) return key;
      if (key === 'current_stage' && existingCols.includes('stage')) return 'stage';
      if (key.startsWith('submission_')){
        const mapped = key.replace('submission_','tracking_');
        if (existingCols.includes(mapped)) return mapped;
      }
      return null;
    }
    for (let key in updates){
      if (!allowedFields.includes(key)) continue;
      const targetCol = mapFieldToColumn(key);
      if (!targetCol) continue;
      queryParts.push(`${targetCol} = $${counter}`);
      values.push(updates[key]);
      counter++;
    }
    values.push(16);
    const query = `UPDATE projects SET ${queryParts.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE project_id = $${counter} RETURNING *`;
    console.log('SQL:', query, 'values:', values);
    const res = await db.query(query, values);
    console.log('Result:', res.rows[0]);
  }catch(err){
    console.error('ERR:', err.stack||err);
  }finally{ process.exit(0);} 
})();