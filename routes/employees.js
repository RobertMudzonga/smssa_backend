const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/employees - list employees
// By default only active employees are returned; pass ?includeInactive=true to see soft-deleted ones.
router.get('/', async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const q = `
      SELECT e.id, e.full_name, e.work_email, e.job_position, e.department, e.manager_id, e.role, e.is_active, e.is_super_admin, e.created_at,
             e.conversions_count, e.total_revenue,
             array_agg(DISTINCT ep.permission) FILTER (WHERE ep.permission IS NOT NULL) as permissions
      FROM employees e
      LEFT JOIN employee_permissions ep ON e.id = ep.employee_id
      ${includeInactive ? '' : 'WHERE e.is_active IS NOT FALSE'}
      GROUP BY e.id, e.full_name, e.work_email, e.job_position, e.department, e.manager_id, e.role, e.is_active, e.is_super_admin, e.created_at, e.conversions_count, e.total_revenue
      ORDER BY e.full_name
    `;
    const { rows } = await db.query(q);
    
    // Fetch additional metrics for each employee (projects count)
    const employeesWithMetrics = await Promise.all(rows.map(async (emp) => {
      // Count projects where employee is project manager
      const projectsQuery = `SELECT COUNT(*) as count FROM projects WHERE project_manager_id = $1`;
      const projectsResult = await db.query(projectsQuery, [emp.id]).catch(() => ({ rows: [{ count: '0' }] }));
      const projects_count = parseInt(projectsResult.rows[0]?.count || '0');
      
      return {
        ...emp,
        projects_count,
        // conversions_count and total_revenue now come from the employees table
        conversions_count: parseInt(emp.conversions_count || 0),
        total_revenue: parseFloat(emp.total_revenue || 0)
      };
    }));
    
    res.json(employeesWithMetrics);
  } catch (err) {
    console.error('Error fetching employees', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const q = `SELECT id, full_name, work_email, job_position, department, manager_id, is_active, is_super_admin, created_at FROM employees WHERE id=$1`;
    const { rows } = await db.query(q, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching employee', err);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

// POST /api/employees
router.post('/', requireAuth, async (req, res) => {
  const { email, firstName, lastName, department, role } = req.body || {};

  if (!email || !firstName || !lastName) {
    return res.status(400).json({ error: 'email, firstName, and lastName are required' });
  }

  try {
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const { rows } = await db.query(
      `INSERT INTO employees (full_name, work_email, department, role, job_position, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
       RETURNING id, full_name, work_email, department, role, job_position, is_active, created_at, updated_at`,
      [fullName, email, department || null, role || 'Employee', 'Employee']
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating employee', err);
    return res.status(500).json({ error: 'Failed to create employee' });
  }
});

// PATCH /api/employees/:id
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const vals = [];
  let idx = 1;
  for (const key of ['full_name','work_email','job_position','department','manager_id','is_active','is_super_admin']) {
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

// DELETE /api/employees/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const employeeResult = await db.query(
      `SELECT id FROM employees WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee = employeeResult.rows[0];
    const { rows } = await db.query(
      `UPDATE employees
       SET is_active = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, work_email, department, role, is_active`,
      [employee.id]
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error('Error deleting employee', err);
    return res.status(500).json({ error: 'Failed to delete employee' });
  }
});

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

// GET /api/employees/:id/permissions - get employee permissions
router.get('/:id/permissions', async (req, res) => {
  const { id } = req.params;
  try {
    const q = `
      SELECT e.id, e.full_name, e.work_email, e.role, e.department, e.job_position,
             array_agg(DISTINCT ep.permission) FILTER (WHERE ep.permission IS NOT NULL) as permissions
      FROM employees e
      LEFT JOIN employee_permissions ep ON e.id = ep.employee_id
      WHERE e.id = $1
      GROUP BY e.id, e.full_name, e.work_email, e.role, e.department, e.job_position
    `;
    const { rows } = await db.query(q, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching employee permissions:', err);
    res.status(500).json({ error: 'Failed to fetch employee permissions' });
  }
});

module.exports = router;
