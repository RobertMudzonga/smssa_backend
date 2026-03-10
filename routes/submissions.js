const express = require('express');
const router = express.Router();
const db = require('../db');

// --- 1. CREATE SUBMISSION ---
router.post('/', async (req, res) => {
  const {
    project_id,
    project_name,
    submission_type,
    submission_date,
    submitted_by,
    status = 'pending',
    notes,
    scheduled_for_date,
    client_name,
    assigned_user_id
  } = req.body;

  try {
    // Check if submissions table exists
    const existsCheck = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') as exists");
    if (!existsCheck.rows[0]?.exists) {
      return res.status(201).json({ ok: true, created: { project_name, submission_type } });
    }

    // Validate required fields
    if (!project_name || !submission_type || !submission_date || !submitted_by) {
      return res.status(400).json({ error: 'Missing required fields: project_name, submission_type, submission_date, submitted_by' });
    }

    const result = await db.query(
      `INSERT INTO submissions (project_id, project_name, submission_type, submission_date, submitted_by, status, notes, scheduled_for_date, client_name, assigned_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [project_id || null, project_name, submission_type, submission_date, submitted_by, status, notes || null, scheduled_for_date || null, client_name || null, assigned_user_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating submission:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- 2. GET ALL SUBMISSIONS ---
router.get('/', async (req, res) => {
  const { project_id, status, submitted_by, month } = req.query;

  try {
    const existsCheck = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') as exists");
    if (!existsCheck.rows[0]?.exists) {
      return res.json([]);
    }

    let query = 'SELECT * FROM submissions WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (project_id) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(project_id);
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (submitted_by) {
      query += ` AND submitted_by = $${paramIndex++}`;
      params.push(submitted_by);
    }

    if (month) {
      query += ` AND TO_CHAR(submission_date, 'YYYY-MM') = $${paramIndex++}`;
      params.push(month);
    }

    query += ' ORDER BY submission_date DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- 3. GET SUBMISSION BY ID ---
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existsCheck = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') as exists");
    if (!existsCheck.rows[0]?.exists) {
      return res.status(404).json({ error: 'Submissions table not found' });
    }

    const result = await db.query('SELECT * FROM submissions WHERE submission_id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching submission:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- 4. UPDATE SUBMISSION ---
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { submission_type, submission_date, status, notes, scheduled_for_date } = req.body;

  try {
    const existsCheck = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') as exists");
    if (!existsCheck.rows[0]?.exists) {
      return res.status(404).json({ error: 'Submissions table not found' });
    }

    // Get current submission
    const currentResult = await db.query('SELECT * FROM submissions WHERE submission_id = $1', [id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const current = currentResult.rows[0];

    // Build update
    const updates = {
      submission_type: submission_type !== undefined ? submission_type : current.submission_type,
      submission_date: submission_date !== undefined ? submission_date : current.submission_date,
      status: status !== undefined ? status : current.status,
      notes: notes !== undefined ? notes : current.notes,
      scheduled_for_date: scheduled_for_date !== undefined ? scheduled_for_date : current.scheduled_for_date,
      updated_at: new Date().toISOString()
    };

    const result = await db.query(
      `UPDATE submissions 
       SET submission_type = $1, submission_date = $2, status = $3, notes = $4, scheduled_for_date = $5, updated_at = $6
       WHERE submission_id = $7
       RETURNING *`,
      [updates.submission_type, updates.submission_date, updates.status, updates.notes, updates.scheduled_for_date, updates.updated_at, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating submission:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- 5. DELETE SUBMISSION ---
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existsCheck = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') as exists");
    if (!existsCheck.rows[0]?.exists) {
      return res.status(404).json({ error: 'Submissions table not found' });
    }

    const result = await db.query('DELETE FROM submissions WHERE submission_id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json({ success: true, message: 'Submission deleted', deleted: result.rows[0] });
  } catch (err) {
    console.error('Error deleting submission:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- 6. GET SUBMISSIONS FOR PROJECT ---
router.get('/by-project/:projectId', async (req, res) => {
  const { projectId } = req.params;

  try {
    const existsCheck = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') as exists");
    if (!existsCheck.rows[0]?.exists) {
      return res.json([]);
    }

    const result = await db.query(
      'SELECT * FROM submissions WHERE project_id = $1 ORDER BY submission_date DESC',
      [projectId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching project submissions:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- 7. GET UPCOMING SUBMISSIONS ---
router.get('/upcoming/this-week', async (req, res) => {
  const { submitted_by } = req.query;

  try {
    const existsCheck = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') as exists");
    if (!existsCheck.rows[0]?.exists) {
      return res.json([]);
    }

    let query = `
      SELECT * FROM submissions 
      WHERE submission_date >= CURRENT_DATE 
        AND submission_date <= CURRENT_DATE + INTERVAL '7 days'
        AND status = 'pending'
    `;
    const params = [];

    if (submitted_by) {
      query += ` AND submitted_by = $1`;
      params.push(submitted_by);
    }

    query += ' ORDER BY submission_date ASC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching upcoming submissions:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
