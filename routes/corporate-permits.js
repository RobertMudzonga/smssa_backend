const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper to build default steps
const DEFAULT_STEPS = [
  'APPLICATION TO THE DEPARTMENT OF LABOUR',
  'APPLICATION TO THE DEPARTMENT OF HOME AFFAIRS FOR CORPORATE PERMIT',
  'INDIVIDUAL CORPORATE WORKER CERTIFICATE'
];

// GET /api/corporate-permits?corporate_client_id=123
router.get('/', async (req, res) => {
  try {
    const { corporate_client_id } = req.query;
    if (!corporate_client_id) return res.status(400).json({ error: 'corporate_client_id is required' });

    // Try to find an existing permit
    const p = await db.query('SELECT * FROM corporate_permits WHERE corporate_client_id = $1', [corporate_client_id]);
    if (p.rows.length === 0) {
      // create a permit record with default steps
      const created = await db.query(
        `INSERT INTO corporate_permits (corporate_client_id) VALUES ($1) RETURNING *`,
        [corporate_client_id]
      );

      const permitId = created.rows[0].permit_id;
      const stepInserts = DEFAULT_STEPS.map((t, i) => {
        return db.query(`INSERT INTO permit_steps (permit_id, step_index, title) VALUES ($1, $2, $3)`, [permitId, i+1, t]);
      });
      await Promise.all(stepInserts);

      // fall through to return created permit
      const permit = await db.query('SELECT * FROM corporate_permits WHERE permit_id = $1', [permitId]);
      // load steps and notes below
      req.permitRow = permit.rows[0];
    }

    const permitRow = p.rows[0] || req.permitRow;
    const stepsRes = await db.query('SELECT * FROM permit_steps WHERE permit_id = $1 ORDER BY step_index', [permitRow.permit_id]);
    const steps = await Promise.all(stepsRes.rows.map(async (s) => {
      const notesRes = await db.query('SELECT * FROM permit_step_notes WHERE permit_step_id = $1 ORDER BY created_at', [s.permit_step_id]);
      return { ...s, notes: notesRes.rows };
    }));

    res.json({ permit: { ...permitRow, steps } });
  } catch (err) {
    console.error('Error in GET /api/corporate-permits', err);
    res.status(500).json({ error: 'Failed to fetch corporate permit', details: err.message });
  }
});

// PATCH /api/corporate-permits/:id/steps/:stepId
router.patch('/:id/steps/:stepId', async (req, res) => {
  try {
    const { id, stepId } = req.params;
    const { completed, completed_by } = req.body;
    const completed_at = completed ? new Date().toISOString() : null;

    const updates = [];
    const values = [];
    let idx = 1;
    if (completed !== undefined) { updates.push(`completed = $${idx++}`); values.push(completed); }
    if (completed_by !== undefined) { updates.push(`completed_by = $${idx++}`); values.push(completed_by); }
    if (completed !== undefined) { updates.push(`completed_at = $${idx++}`); values.push(completed_at); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id, stepId);
    const q = `UPDATE permit_steps SET ${updates.join(', ')} WHERE permit_id = $${idx++} AND permit_step_id = $${idx++} RETURNING *`;
    const r = await db.query(q, values);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Step not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error updating permit step', err);
    res.status(500).json({ error: 'Failed to update step', details: err.message });
  }
});

// POST /api/corporate-permits/:id/steps/:stepId/notes
router.post('/:id/steps/:stepId/notes', async (req, res) => {
  try {
    const { id, stepId } = req.params;
    const { content, author_name, author_role } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    // Ensure step exists and belongs to permit
    const stepCheck = await db.query('SELECT * FROM permit_steps WHERE permit_id = $1 AND permit_step_id = $2', [id, stepId]);
    if (stepCheck.rows.length === 0) return res.status(404).json({ error: 'Step not found' });

    const result = await db.query(`INSERT INTO permit_step_notes (permit_step_id, author_name, author_role, content) VALUES ($1, $2, $3, $4) RETURNING *`, [stepId, author_name || null, author_role || null, content]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding permit note', err);
    res.status(500).json({ error: 'Failed to add note', details: err.message });
  }
});

module.exports = router;
