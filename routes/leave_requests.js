const express = require('express');
const router = express.Router();
const db = require('../db');

// Create leave request table if it doesn't exist
router.use(async (req, res, next) => {
  try {
    const tableExists = await db.query(
      `SELECT EXISTS(
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema='public' AND table_name='leave_requests'
      )`
    );
    
    if (!tableExists.rows[0].exists) {
      await db.query(`
        CREATE TABLE leave_requests (
          id SERIAL PRIMARY KEY,
          employee_id INTEGER,
          employee_name VARCHAR(255),
          leave_type VARCHAR(50),
          start_date DATE,
          end_date DATE,
          reason TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          created_by VARCHAR(255),
          approved_by VARCHAR(255),
          comments TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Created leave_requests table');
    }
  } catch (err) {
    console.error('Error checking/creating leave_requests table:', err);
  }
  next();
});

// Get all leave requests
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM leave_requests ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching leave requests:', err);
    res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// Get leave request by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT * FROM leave_requests WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching leave request:', err);
    res.status(500).json({ error: 'Failed to fetch leave request' });
  }
});

// Create leave request
router.post('/', async (req, res) => {
  try {
    const { leave_type, start_date, end_date, reason } = req.body;
    const createdBy = req.headers['x-user-email'] || 'system';
    
    if (!leave_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Look up employee by email
    let employeeId = null;
    let employeeName = null;
    
    try {
      const employeeResult = await db.query(
        `SELECT id, full_name FROM employees WHERE work_email = $1 OR personal_email = $1 LIMIT 1`,
        [createdBy]
      );
      
      if (employeeResult.rows.length > 0) {
        employeeId = employeeResult.rows[0].id;
        employeeName = employeeResult.rows[0].full_name;
      }
    } catch (err) {
      console.warn('Could not look up employee:', err);
      // Continue without employee info
    }

    const result = await db.query(
      `INSERT INTO leave_requests (employee_id, employee_name, leave_type, start_date, end_date, reason, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [employeeId, employeeName || createdBy, leave_type, start_date, end_date, reason || '', createdBy]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating leave request:', err);
    res.status(500).json({ error: 'Failed to create leave request' });
  }
});

// Update leave request status
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comments } = req.body;
    const approvedBy = req.headers['x-user-email'] || 'system';

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await db.query(
      `UPDATE leave_requests 
       SET status = $1, approved_by = $2, comments = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, approvedBy, comments || '', id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating leave request:', err);
    res.status(500).json({ error: 'Failed to update leave request' });
  }
});

// Delete leave request
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      `DELETE FROM leave_requests WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }
    
    res.json({ message: 'Leave request deleted successfully' });
  } catch (err) {
    console.error('Error deleting leave request:', err);
    res.status(500).json({ error: 'Failed to delete leave request' });
  }
});

module.exports = router;
