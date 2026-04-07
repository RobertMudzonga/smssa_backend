const express = require('express');
const router = express.Router();
const db = require('../db');

// ============================================================================
// GET ROUTES
// ============================================================================

/**
 * GET /api/employee-visas
 * Fetch all employee visas for a corporate client (via token)
 */
router.get('/', async (req, res) => {
  try {
    const { token, corporate_client_id, status, days_expiring } = req.query;
    
    let query = `
      SELECT * FROM employee_visas
      WHERE corporate_client_id = $1
    `;
    const params = [];
    
    if (token && !corporate_client_id) {
      // Get corporate_client_id from token
      const corpRes = await db.query(
        'SELECT corporate_id FROM corporate_clients WHERE access_token = $1',
        [token]
      );
      if (corpRes.rows.length === 0) {
        return res.status(404).json({ error: 'Invalid token' });
      }
      params.push(corpRes.rows[0].corporate_id);
    } else if (corporate_client_id) {
      params.push(corporate_client_id);
    } else {
      return res.status(400).json({ error: 'Token or corporate_client_id required' });
    }

    // Add filters
    let paramIndex = 2;
    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (days_expiring) {
      // Find visas expiring within X days
      query += ` AND visa_expiry_date <= CURRENT_DATE + INTERVAL '${parseInt(days_expiring)} days'`;
      query += ` AND visa_expiry_date >= CURRENT_DATE`;
    }

    query += ` ORDER BY visa_expiry_date ASC`;

    const result = await db.query(query, params);
    res.json({
      visas: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('Error fetching employee visas:', err);
    res.status(500).json({ error: 'Failed to fetch employee visas' });
  }
});

/**
 * GET /api/employee-visas/:visa_id
 * Fetch a specific employee visa
 */
router.get('/:visa_id', async (req, res) => {
  try {
    const { visa_id } = req.params;
    const result = await db.query('SELECT * FROM employee_visas WHERE visa_id = $1', [visa_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee visa not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching employee visa:', err);
    res.status(500).json({ error: 'Failed to fetch employee visa' });
  }
});

/**
 * GET /api/employee-visas/alerts/expiring-soon
 * Fetch visas expiring soon for alert purposes
 */
router.get('/alerts/expiring-soon', async (req, res) => {
  try {
    const { token, days = 30 } = req.query;
    
    const corpRes = await db.query(
      'SELECT corporate_id FROM corporate_clients WHERE access_token = $1',
      [token]
    );
    if (corpRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid token' });
    }

    const result = await db.query(
      `SELECT * FROM employee_visas 
       WHERE corporate_client_id = $1 
       AND status = 'active'
       AND visa_expiry_date <= CURRENT_DATE + INTERVAL '${parseInt(days)} days'
       AND visa_expiry_date >= CURRENT_DATE
       ORDER BY visa_expiry_date ASC`,
      [corpRes.rows[0].corporate_id]
    );

    res.json({
      alerts: result.rows,
      count: result.rows.length,
      alert_window_days: parseInt(days)
    });
  } catch (err) {
    console.error('Error fetching visa expiry alerts:', err);
    res.status(500).json({ error: 'Failed to fetch visa expiry alerts' });
  }
});

// ============================================================================
// POST ROUTES
// ============================================================================

/**
 * POST /api/employee-visas
 * Create a new employee visa record
 */
router.post('/', async (req, res) => {
  try {
    const {
      token,
      corporate_client_id,
      employee_name,
      employee_email,
      employee_phone,
      passport_number,
      visa_type_id,
      visa_type_name,
      visa_number,
      visa_issue_date,
      visa_expiry_date,
      country_of_issue,
      position_title,
      department,
      employment_start_date,
      employment_end_date,
      status = 'active',
      renewal_notes,
      document_reference
    } = req.body;

    let corporateId = corporate_client_id;
    
    // If token provided, resolve corporate_client_id
    if (token && !corporateId) {
      const corpRes = await db.query(
        'SELECT corporate_id FROM corporate_clients WHERE access_token = $1',
        [token]
      );
      if (corpRes.rows.length === 0) {
        return res.status(404).json({ error: 'Invalid token' });
      }
      corporateId = corpRes.rows[0].corporate_id;
    }

    if (!corporateId || !employee_name || !visa_expiry_date) {
      return res.status(400).json({ error: 'Missing required fields: corporate_client_id, employee_name, visa_expiry_date' });
    }

    const result = await db.query(
      `INSERT INTO employee_visas (
        corporate_client_id, employee_name, employee_email, employee_phone,
        passport_number, visa_type_id, visa_type_name, visa_number,
        visa_issue_date, visa_expiry_date, country_of_issue,
        position_title, department, employment_start_date, employment_end_date,
        status, renewal_notes, document_reference
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        corporateId, employee_name, employee_email, employee_phone,
        passport_number, visa_type_id, visa_type_name, visa_number,
        visa_issue_date, visa_expiry_date, country_of_issue,
        position_title, department, employment_start_date, employment_end_date,
        status, renewal_notes, document_reference
      ]
    );

    res.status(201).json({
      success: true,
      visa: result.rows[0]
    });
  } catch (err) {
    console.error('Error creating employee visa:', err);
    res.status(500).json({ error: 'Failed to create employee visa' });
  }
});

// ============================================================================
// PATCH ROUTES
// ============================================================================

/**
 * PATCH /api/employee-visas/:visa_id
 * Update an employee visa record
 */
router.patch('/:visa_id', async (req, res) => {
  try {
    const { visa_id } = req.params;
    const fields = [];
    const values = [];
    let paramIndex = 1;

    // Allowed fields to update
    const allowedFields = [
      'employee_name', 'employee_email', 'employee_phone', 'passport_number',
      'visa_type_id', 'visa_type_name', 'visa_number', 'visa_issue_date',
      'visa_expiry_date', 'country_of_issue', 'position_title', 'department',
      'employment_start_date', 'employment_end_date', 'status', 'renewal_notes',
      'document_reference', 'renewal_alert_sent_at'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        fields.push(`${field} = $${paramIndex}`);
        values.push(req.body[field]);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(visa_id);

    const result = await db.query(
      `UPDATE employee_visas SET ${fields.join(', ')} WHERE visa_id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee visa not found' });
    }

    res.json({
      success: true,
      visa: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating employee visa:', err);
    res.status(500).json({ error: 'Failed to update employee visa' });
  }
});

// ============================================================================
// DELETE ROUTES
// ============================================================================

/**
 * DELETE /api/employee-visas/:visa_id
 * Delete an employee visa record (soft delete via status)
 */
router.delete('/:visa_id', async (req, res) => {
  try {
    const { visa_id } = req.params;
    const { soft_delete = true } = req.query;

    let result;
    
    if (soft_delete) {
      // Soft delete by marking as cancelled
      result = await db.query(
        `UPDATE employee_visas SET status = 'cancelled' WHERE visa_id = $1 RETURNING *`,
        [visa_id]
      );
    } else {
      // Hard delete
      result = await db.query(
        `DELETE FROM employee_visas WHERE visa_id = $1 RETURNING *`,
        [visa_id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee visa not found' });
    }

    res.json({
      success: true,
      message: soft_delete ? 'Employee visa marked as cancelled' : 'Employee visa deleted',
      visa: result.rows[0]
    });
  } catch (err) {
    console.error('Error deleting employee visa:', err);
    res.status(500).json({ error: 'Failed to delete employee visa' });
  }
});

module.exports = router;
