const express = require('express');
const router = express.Router();
const db = require('../db');

console.log('Loaded routes/payment_requests.js');

// GET /api/payment-requests - list all payment requests
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        pr.payment_request_id,
        pr.amount,
        pr.description,
        pr.due_date,
        pr.is_urgent,
        pr.status,
        pr.approved_at,
        pr.paid_at,
        pr.rejection_reason,
        pr.created_at,
        pr.updated_at,
        pr.requester_id,
        pr.approved_by,
        pr.paid_by,
        COALESCE(e.full_name, 'Unknown') AS requester_name
      FROM payment_requests pr
      LEFT JOIN employees e ON pr.requester_id = e.id
      ORDER BY 
        CASE WHEN pr.is_urgent THEN 0 ELSE 1 END,
        pr.due_date ASC,
        pr.created_at DESC
    `);
    console.log('Fetched payment requests:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching payment requests:', err);
    res.status(500).json({ error: 'Failed to fetch payment requests', detail: err.message });
  }
});

// POST /api/payment-requests - create a payment request
router.post('/', async (req, res) => {
  const { amount, description, due_date, is_urgent = false, requester_id } = req.body;

  console.log('Creating payment request:', { amount, description, due_date, is_urgent, requester_id });

  if (!amount || !description || !due_date || !requester_id) {
    return res.status(400).json({ error: 'Missing required fields: amount, description, due_date, requester_id' });
  }

  try {
    // Get requester name for notification
    const requesterResult = await db.query(
      `SELECT full_name FROM employees WHERE id = $1`,
      [requester_id]
    );
    const requesterName = requesterResult.rows[0]?.full_name || 'Unknown Employee';

    const result = await db.query(
      `INSERT INTO payment_requests (requester_id, amount, description, due_date, is_urgent, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [requester_id, amount, description, due_date, is_urgent]
    );
    console.log('Payment request created:', result.rows[0]);

    // Notify Prisca (accountant, id=12) about the new payment request
    try {
      const urgencyLabel = is_urgent ? 'URGENT ' : '';
      await db.query(
        `INSERT INTO notifications (
          employee_id, type, title, message, 
          related_entity_type, related_entity_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          12, // Prisca Sibanda (accountant)
          'payment_request',
          `New ${urgencyLabel}Payment Request from ${requesterName}`,
          `A payment request for ZWL ${amount} has been submitted. Description: ${description}. Due: ${due_date}`,
          'payment_request',
          result.rows[0].payment_request_id
        ]
      );
    } catch (notifErr) {
      console.error('Error creating payment request notification:', notifErr);
      // Don't fail the request if notification fails
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating payment request:', err);
    res.status(500).json({ error: 'Failed to create payment request', detail: err.message });
  }
});

// PATCH /api/payment-requests/:id/approve - approve a payment request
router.patch('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { approved_by } = req.body;

  if (!approved_by) {
    return res.status(400).json({ error: 'approved_by (user_id) is required' });
  }

  try {
    // First get the payment request details
    const paymentRequestResult = await db.query(
      `SELECT pr.*, e.full_name as requester_name 
       FROM payment_requests pr
       LEFT JOIN employees e ON pr.requester_id = e.id
       WHERE pr.payment_request_id = $1`,
      [id]
    );

    if (paymentRequestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    const paymentRequest = paymentRequestResult.rows[0];

    const result = await db.query(
      `UPDATE payment_requests 
       SET status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE payment_request_id = $2 AND status = 'pending'
       RETURNING *`,
      [approved_by, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment request not found or already processed' });
    }

    // Notify the requester that their payment request was approved
    try {
      if (paymentRequest.requester_id) {
        await db.query(
          `INSERT INTO notifications (
            employee_id, type, title, message, 
            related_entity_type, related_entity_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [
            paymentRequest.requester_id,
            'payment_request',
            'Payment Request Approved',
            `Your payment request for ZWL ${paymentRequest.amount} has been approved and is ready for processing.`,
            'payment_request',
            id
          ]
        );
      }
    } catch (notifErr) {
      console.error('Error creating approval notification:', notifErr);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error approving payment request:', err);
    res.status(500).json({ error: 'Failed to approve payment request', detail: err.message });
  }
});

// PATCH /api/payment-requests/:id/reject - reject a payment request
router.patch('/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { approved_by, rejection_reason } = req.body;

  if (!approved_by) {
    return res.status(400).json({ error: 'approved_by (user_id) is required' });
  }

  try {
    // First get the payment request details
    const paymentRequestResult = await db.query(
      `SELECT pr.*, e.full_name as requester_name 
       FROM payment_requests pr
       LEFT JOIN employees e ON pr.requester_id = e.id
       WHERE pr.payment_request_id = $1`,
      [id]
    );

    if (paymentRequestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    const paymentRequest = paymentRequestResult.rows[0];

    const result = await db.query(
      `UPDATE payment_requests 
       SET status = 'rejected', approved_by = $1, approved_at = CURRENT_TIMESTAMP, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE payment_request_id = $3 AND status = 'pending'
       RETURNING *`,
      [approved_by, rejection_reason, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment request not found or already processed' });
    }

    // Notify the requester that their payment request was rejected
    try {
      if (paymentRequest.requester_id) {
        const reasonText = rejection_reason ? `Reason: ${rejection_reason}` : '';
        await db.query(
          `INSERT INTO notifications (
            employee_id, type, title, message, 
            related_entity_type, related_entity_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [
            paymentRequest.requester_id,
            'payment_request',
            'Payment Request Rejected',
            `Your payment request for ZWL ${paymentRequest.amount} has been rejected. ${reasonText}`,
            'payment_request',
            id
          ]
        );
      }
    } catch (notifErr) {
      console.error('Error creating rejection notification:', notifErr);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error rejecting payment request:', err);
    res.status(500).json({ error: 'Failed to reject payment request', detail: err.message });
  }
});

// PATCH /api/payment-requests/:id/mark-paid - mark as paid
router.patch('/:id/mark-paid', async (req, res) => {
  const { id } = req.params;
  const { paid_by } = req.body;

  if (!paid_by) {
    return res.status(400).json({ error: 'paid_by (user_id) is required' });
  }

  try {
    const result = await db.query(
      `UPDATE payment_requests 
       SET status = 'paid', paid_by = $1, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE payment_request_id = $2 AND status = 'approved'
       RETURNING *`,
      [paid_by, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment request not found or not approved' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error marking payment as paid:', err);
    res.status(500).json({ error: 'Failed to mark payment as paid', detail: err.message });
  }
});

// DELETE /api/payment-requests/:id - delete a payment request
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      'DELETE FROM payment_requests WHERE payment_request_id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    res.json({ message: 'Payment request deleted', payment_request: result.rows[0] });
  } catch (err) {
    console.error('Error deleting payment request:', err);
    res.status(500).json({ error: 'Failed to delete payment request', detail: err.message });
  }
});

module.exports = router;
