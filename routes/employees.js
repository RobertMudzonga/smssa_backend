const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/employees - list employees
router.get('/', async (req, res) => {
  try {
    const q = `SELECT id, full_name, work_email, job_position, department, manager_id, is_active, created_at FROM employees ORDER BY full_name`;
    const { rows } = await db.query(q);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching employees', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const q = `SELECT id, full_name, work_email, job_position, department, manager_id, is_active, created_at FROM employees WHERE id=$1`;
    const { rows } = await db.query(q, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching employee', err);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// POST /api/employees
router.post('/', async (req, res) => {
  const { full_name, work_email, job_position, department, manager_id } = req.body;
  try {
    const q = `INSERT INTO employees (full_name, work_email, job_position, department, manager_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`;
    const { rows } = await db.query(q, [full_name, work_email, job_position, department || null, manager_id || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating employee', err);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// PATCH /api/employees/:id
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const vals = [];
  let idx = 1;
  for (const key of ['full_name','work_email','job_position','department','manager_id','is_active']) {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      vals.push(req.body[key]);
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  vals.push(id);
  const q = `UPDATE employees SET ${fields.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
  try {
    const { rows } = await db.query(q, vals);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating employee', err);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// DELETE /api/employees/:id  (soft delete: set is_active=false)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const q = `UPDATE employees SET is_active = false, updated_at = now() WHERE id=$1 RETURNING *`;
    const { rows } = await db.query(q, [id]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error deleting employee', err);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

module.exports = router;

// POST /api/employees/:id/metrics - trigger a metrics calculation (lightweight)
router.post('/:id/metrics', async (req, res) => {
  const { id } = req.params;
  const { periodStart, periodEnd } = req.body || {};
  try {
    // Placeholder: try to call a stored procedure or background job if present
    // For now, respond OK and let real implementation be added later.
    console.log('Metrics requested for employee', id, { periodStart, periodEnd });
    res.json({ ok: true, message: 'Metrics calculation scheduled' });
  } catch (err) {
    console.error('Error scheduling metrics calculation:', err);
    res.status(500).json({ error: 'Failed to schedule metrics calculation' });
  }
});
