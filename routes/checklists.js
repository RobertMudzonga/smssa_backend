const express = require('express');
const router = express.Router();
const db = require('../db');

// Get checklist rows for a project
router.get('/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const sql = `SELECT * FROM document_checklists WHERE project_id = $1 ORDER BY document_category, id`;
    try {
      const result = await db.query(sql, [projectId]);
      return res.json({ ok: true, checklist: result.rows });
    } catch (dbErr) {
      console.error('Checklist DB query failed:', dbErr && dbErr.stack ? dbErr.stack : dbErr);
      // Return a graceful, non-500 response so the frontend can continue in offline/local mode
      return res.json({ ok: false, error: 'database_unavailable', checklist: [] });
    }
  } catch (err) {
    next(err);
  }
});

// Update a checklist item (toggle received, notes, required flag)
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_received, notes, is_required } = req.body;
    const fields = [];
    const params = [];
    let idx = 1;

    if (typeof is_received !== 'undefined') {
      fields.push(`is_received = $${idx++}`);
      params.push(is_received);
      if (is_received) {
        fields.push(`received_date = $${idx++}`);
        params.push(new Date().toISOString());
      } else {
        fields.push(`received_date = null`);
      }
    }

    if (typeof notes !== 'undefined') {
      fields.push(`notes = $${idx++}`);
      params.push(notes);
    }

    if (typeof is_required !== 'undefined') {
      fields.push(`is_required = $${idx++}`);
      params.push(is_required);
    }

    if (fields.length === 0) return res.status(400).json({ ok: false, error: 'no fields to update' });

    const sql = `UPDATE document_checklists SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    params.push(id);
    try {
      const result = await db.query(sql, params);
      return res.json({ ok: true, updated: result.rows[0] });
    } catch (dbErr) {
      console.error('Checklist update failed:', dbErr && dbErr.stack ? dbErr.stack : dbErr);
      return res.status(200).json({ ok: false, error: 'database_unavailable' });
    }
  } catch (err) {
    next(err);
  }
});

// Mark reminder sent for one or more checklist items
router.patch('/:id/notify', async (req, res, next) => {
  try {
    const { id } = req.params;
    const now = new Date().toISOString();
    const sql = `UPDATE document_checklists SET reminder_sent_date = $1 WHERE id = $2 RETURNING *`;
    try {
      const result = await db.query(sql, [now, id]);
      return res.json({ ok: true, updated: result.rows[0] });
    } catch (dbErr) {
      console.error('Checklist notify failed:', dbErr && dbErr.stack ? dbErr.stack : dbErr);
      return res.status(200).json({ ok: false, error: 'database_unavailable' });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
