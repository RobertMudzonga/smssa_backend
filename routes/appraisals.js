const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/appraisals - list with optional filters
router.get('/', async (req, res) => {
  const { employee_id, review_period } = req.query;
  try {
    let q = `SELECT a.*, e.full_name AS employee_name, r.full_name AS reviewer_name
             FROM appraisals a
             LEFT JOIN employees e ON e.id = a.employee_id
             LEFT JOIN employees r ON r.id = a.reviewer_id`;
    const conditions = [];
    const vals = [];
    let idx = 1;
    if (employee_id) {
      conditions.push(`a.employee_id = $${idx++}`);
      vals.push(employee_id);
    }
    if (review_period) {
      conditions.push(`a.review_period = $${idx++}`);
      vals.push(review_period);
    }
    if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
    q += ' ORDER BY review_date DESC';
    const { rows } = await db.query(q, vals);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching appraisals', err);
    res.status(500).json({ error: 'Failed to fetch appraisals' });
  }
});

// GET /api/appraisals/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const q = `SELECT a.*, e.full_name AS employee_name, r.full_name AS reviewer_name
               FROM appraisals a
               LEFT JOIN employees e ON e.id = a.employee_id
               LEFT JOIN employees r ON r.id = a.reviewer_id
               WHERE a.appraisal_id = $1`;
    const { rows } = await db.query(q, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Appraisal not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching appraisal', err);
    res.status(500).json({ error: 'Failed to fetch appraisal' });
  }
});

// POST /api/appraisals
router.post('/', async (req, res) => {
  const { employee_id, reviewer_id, review_date, review_period, rating, key_achievements, development_goals } = req.body;
  try {
    const q = `INSERT INTO appraisals (employee_id, reviewer_id, review_date, review_period, rating, key_achievements, development_goals)
               VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`;
    const vals = [employee_id, reviewer_id, review_date, review_period, rating || null, key_achievements || null, development_goals || null];
    const { rows } = await db.query(q, vals);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating appraisal', err);
    res.status(500).json({ error: 'Failed to create appraisal' });
  }
});

// PATCH /api/appraisals/:id
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const vals = [];
  let idx = 1;
  for (const key of ['employee_id','reviewer_id','review_date','review_period','rating','key_achievements','development_goals']) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      vals.push(req.body[key]);
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  vals.push(id);
  const q = `UPDATE appraisals SET ${fields.join(', ')}, updated_at = now() WHERE appraisal_id = $${idx} RETURNING *`;
  try {
    const { rows } = await db.query(q, vals);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating appraisal', err);
    res.status(500).json({ error: 'Failed to update appraisal' });
  }
});

// DELETE /api/appraisals/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const q = `DELETE FROM appraisals WHERE appraisal_id = $1 RETURNING *`;
    const { rows } = await db.query(q, [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error deleting appraisal', err);
    res.status(500).json({ error: 'Failed to delete appraisal' });
  }
});

module.exports = router;
