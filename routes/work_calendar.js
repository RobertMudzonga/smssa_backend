const express = require('express');
const xlsx = require('xlsx');
const db = require('../db');

const router = express.Router();

function parseDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

router.get('/items', async (req, res) => {
  const start = parseDateOnly(req.query.start) || '1970-01-01';
  const end = parseDateOnly(req.query.end) || '2999-12-31';

  try {
    const { rows } = await db.query(
      `SELECT w.id, w.employee_id, e.full_name AS employee_name, w.title, w.details,
              TO_CHAR(w.requested_for_date, 'YYYY-MM-DD') AS requested_for_date,
              w.status, w.created_by_employee_id,
              c.full_name AS created_by_name,
              w.created_at, w.updated_at
       FROM work_calendar_items w
       LEFT JOIN employees e ON e.id = w.employee_id
       LEFT JOIN employees c ON c.id = w.created_by_employee_id
       WHERE w.requested_for_date BETWEEN $1 AND $2
       ORDER BY w.requested_for_date ASC, w.created_at ASC`,
      [start, end]
    );

    return res.json(rows || []);
  } catch (err) {
    console.error('Error fetching work calendar items:', err);
    return res.status(500).json({ error: 'Failed to fetch work calendar items' });
  }
});

router.post('/items', async (req, res) => {
  const { title, details, requested_for_date, status, employee_id, created_by_employee_id } = req.body || {};

  if (!title || !requested_for_date) {
    return res.status(400).json({ error: 'title and requested_for_date are required' });
  }

  const dateOnly = parseDateOnly(requested_for_date);
  if (!dateOnly) {
    return res.status(400).json({ error: 'Invalid requested_for_date' });
  }

  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required' });
  }

  try {
    const { rows } = await db.query(
      `WITH inserted AS (
         INSERT INTO work_calendar_items
           (employee_id, title, details, requested_for_date, status, created_by_employee_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *
       )
       SELECT i.id, i.employee_id, e.full_name AS employee_name, i.title, i.details,
              TO_CHAR(i.requested_for_date, 'YYYY-MM-DD') AS requested_for_date,
              i.status, i.created_by_employee_id, c.full_name AS created_by_name,
              i.created_at, i.updated_at
       FROM inserted i
       LEFT JOIN employees e ON e.id = i.employee_id
       LEFT JOIN employees c ON c.id = i.created_by_employee_id`,
      [
        employee_id,
        String(title).trim(),
        details || null,
        dateOnly,
        status || 'pending',
        created_by_employee_id || null,
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating work calendar item:', err);
    return res.status(500).json({ error: 'Failed to create work calendar item' });
  }
});

router.patch('/items/:id', async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const values = [];
  let index = 1;

  const map = {
    employee_id: req.body?.employee_id,
    title: req.body?.title,
    details: req.body?.details,
    requested_for_date: req.body?.requested_for_date,
    status: req.body?.status,
  };

  Object.entries(map).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === 'requested_for_date') {
      const parsed = parseDateOnly(value);
      if (!parsed) return;
      fields.push(`${key} = $${index++}`);
      values.push(parsed);
      return;
    }

    fields.push(`${key} = $${index++}`);
    values.push(value);
  });

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(id);

  try {
    const { rows } = await db.query(
      `WITH updated AS (
         UPDATE work_calendar_items
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${index}
         RETURNING *
       )
       SELECT u.id, u.employee_id, e.full_name AS employee_name, u.title, u.details,
              TO_CHAR(u.requested_for_date, 'YYYY-MM-DD') AS requested_for_date,
              u.status, u.created_by_employee_id, c.full_name AS created_by_name,
              u.created_at, u.updated_at
       FROM updated u
       LEFT JOIN employees e ON e.id = u.employee_id
       LEFT JOIN employees c ON c.id = u.created_by_employee_id`,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Work calendar item not found' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('Error updating work calendar item:', err);
    return res.status(500).json({ error: 'Failed to update work calendar item' });
  }
});

router.delete('/items/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { rowCount } = await db.query('DELETE FROM work_calendar_items WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Work calendar item not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting work calendar item:', err);
    return res.status(500).json({ error: 'Failed to delete work calendar item' });
  }
});

router.post('/export', async (req, res) => {
  const { startDate, endDate, view } = req.body || {};
  const start = parseDateOnly(startDate) || '1970-01-01';
  const end = parseDateOnly(endDate) || '2999-12-31';

  try {
    const { rows } = await db.query(
      `SELECT w.id, TO_CHAR(w.requested_for_date, 'YYYY-MM-DD') AS requested_for_date,
            w.title, w.details, w.status,
              e.full_name AS employee_name,
              c.full_name AS created_by_name
       FROM work_calendar_items w
       LEFT JOIN employees e ON e.id = w.employee_id
       LEFT JOIN employees c ON c.id = w.created_by_employee_id
       WHERE w.requested_for_date BETWEEN $1 AND $2
       ORDER BY w.requested_for_date ASC, w.created_at ASC`,
      [start, end]
    );

    const worksheetRows = (rows || []).map((item) => ({
      Date: parseDateOnly(item.requested_for_date),
      Employee: item.employee_name || '',
      Request: item.title || '',
      Details: item.details || '',
      Status: item.status || '',
      CreatedBy: item.created_by_name || '',
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(worksheetRows.length ? worksheetRows : [{ Date: start, Employee: '', Request: '', Details: '', Status: '', CreatedBy: '' }]);
    xlsx.utils.book_append_sheet(wb, ws, 'Work Calendar');

    const metaWs = xlsx.utils.json_to_sheet([
      { Field: 'View', Value: view || 'custom' },
      { Field: 'Start Date', Value: start },
      { Field: 'End Date', Value: end },
      { Field: 'Exported At', Value: new Date().toISOString() },
      { Field: 'Total Items', Value: worksheetRows.length },
    ]);
    xlsx.utils.book_append_sheet(wb, metaWs, 'Metadata');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `work-calendar-${view || 'custom'}-${start}-to-${end}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error exporting work calendar:', err);
    return res.status(500).json({ error: 'Failed to export work calendar' });
  }
});

module.exports = router;
