const express = require('express');
const router = express.Router();
const db = require('../db');
const { notifyManagers } = require('../lib/notifications');
const leaveBalance = require('../lib/leaveBalance');

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
          days_requested DECIMAL(5,2),
          days_paid DECIMAL(5,2) DEFAULT 0.00,
          days_unpaid DECIMAL(5,2) DEFAULT 0.00,
          is_fully_paid BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Created leave_requests table');
    } else {
      // Add missing columns if they don't exist
      try {
        await db.query(
          `ALTER TABLE leave_requests 
           ADD COLUMN IF NOT EXISTS days_requested DECIMAL(5,2),
           ADD COLUMN IF NOT EXISTS days_paid DECIMAL(5,2) DEFAULT 0.00,
           ADD COLUMN IF NOT EXISTS days_unpaid DECIMAL(5,2) DEFAULT 0.00,
           ADD COLUMN IF NOT EXISTS is_fully_paid BOOLEAN DEFAULT true`
        );
      } catch (err) {
        console.warn('Could not add leave columns (may already exist):', err.message);
      }
    }
  } catch (err) {
    console.error('Error checking/creating leave_requests table:', err);
  }

  // Create leave_balances table if it doesn't exist
  try {
    const balanceTableExists = await db.query(
      `SELECT EXISTS(
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema='public' AND table_name='leave_balances'
      )`
    );
    
    if (!balanceTableExists.rows[0].exists) {
      await db.query(`
        CREATE TABLE leave_balances (
          id SERIAL PRIMARY KEY,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          year INTEGER NOT NULL,
          total_days_allocated DECIMAL(5,2) DEFAULT 18.00,
          days_used DECIMAL(5,2) DEFAULT 0.00,
          days_remaining DECIMAL(5,2) DEFAULT 18.00,
          days_earned DECIMAL(5,2) DEFAULT 0.00,
          reset_date DATE DEFAULT CURRENT_DATE,
          accrual_rate DECIMAL(5,2) DEFAULT 1.5,
          last_accrual_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(employee_id, year)
        )
      `);
      console.log('Created leave_balances table');
      
      // Create index for faster lookups
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_year ON leave_balances(employee_id, year)`
      );
    }
  } catch (err) {
    console.error('Error checking/creating leave_balances table:', err);
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

// Get leave balance for current employee
router.get('/balance/me', async (req, res) => {
  try {
    const email = req.headers['x-user-email'] || 'system';
    
    // Look up employee by email
    const employeeResult = await db.query(
      `SELECT id FROM employees WHERE work_email = $1 LIMIT 1`,
      [email]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const employeeId = employeeResult.rows[0].id;
    const year = new Date().getFullYear();
    
    try {
      // Get or create leave balance
      const balanceSummary = await leaveBalance.getLeaveBalanceSummary(employeeId, year);
      res.json(balanceSummary);
    } catch (balanceErr) {
      console.error('Error in getLeaveBalanceSummary:', balanceErr);
      // Return a default balance if calculation fails
      res.json({
        employeeId,
        year,
        totalAllocated: 18.0,
        accruedToDate: 0,
        daysUsed: 0,
        daysRemaining: 0,
        lastAccrualDate: new Date().toISOString(),
        error: 'Using default balance - calculation failed'
      });
    }
  } catch (err) {
    console.error('Error fetching leave balance:', err);
    res.status(500).json({ error: 'Failed to fetch leave balance', details: err.message });
  }
});

// Get leave balance for specific employee
router.get('/balance/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const year = new Date().getFullYear();
    
    const balanceSummary = await leaveBalance.getLeaveBalanceSummary(employeeId, year);
    
    res.json(balanceSummary);
  } catch (err) {
    console.error('Error fetching leave balance:', err);
    res.status(500).json({ error: 'Failed to fetch leave balance' });
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
    let employeeDepartment = null;
    
    try {
      const employeeResult = await db.query(
        `SELECT id, full_name, department, manager_id FROM employees WHERE work_email = $1 LIMIT 1`,
        [createdBy]
      );
      
      if (employeeResult.rows.length > 0) {
        employeeId = employeeResult.rows[0].id;
        employeeName = employeeResult.rows[0].full_name;
        employeeDepartment = employeeResult.rows[0].department;
      }
    } catch (err) {
      console.warn('Could not look up employee:', err);
      // Continue without employee info
    }

    // Calculate number of days requested (including both start and end dates)
    const daysRequested = Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)) + 1;
    
    // Calculate paid and unpaid days based on leave balance
    let daysPaid = daysRequested;
    let daysUnpaid = 0;
    let isFullyPaid = true;
    
    // Only calculate paid/unpaid for annual leave requests
    if (leave_type === 'annual' && employeeId) {
      try {
        const year = new Date().getFullYear();
        
        // Get or create leave balance for this employee
        const balance = await leaveBalance.getLeaveBalance(employeeId, year);
        const accruedDays = leaveBalance.calculateAccruedLeaveDays(new Date());
        const daysAvailable = accruedDays - (balance.days_used || 0);
        
        // Calculate split between paid and unpaid
        if (daysAvailable >= daysRequested) {
          daysPaid = daysRequested;
          daysUnpaid = 0;
          isFullyPaid = true;
        } else if (daysAvailable > 0) {
          daysPaid = Math.round(daysAvailable * 100) / 100;
          daysUnpaid = daysRequested - daysPaid;
          isFullyPaid = false;
        } else {
          daysPaid = 0;
          daysUnpaid = daysRequested;
          isFullyPaid = false;
        }
      } catch (balanceErr) {
        console.warn('Could not calculate leave balance:', balanceErr);
        // Default to fully paid if balance calculation fails
        daysPaid = daysRequested;
        daysUnpaid = 0;
        isFullyPaid = true;
      }
    }

    const result = await db.query(
      `INSERT INTO leave_requests (
        employee_id, employee_name, leave_type, start_date, end_date, reason, 
        status, created_by, days_requested, days_paid, days_unpaid, is_fully_paid
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        employeeId, employeeName || createdBy, leave_type, start_date, end_date, reason || '', 
        createdBy, daysRequested, daysPaid, daysUnpaid, isFullyPaid
      ]
    );
    
    const leaveRequest = result.rows[0];

    // Notify all managers about the new leave request with balance info
    try {
      const startFormatted = new Date(start_date).toLocaleDateString();
      const endFormatted = new Date(end_date).toLocaleDateString();
      const durationText = daysRequested > 1 ? ` (${daysRequested} days)` : ' (1 day)';
      const reasonText = reason ? ` Reason: ${reason}` : '';
      const balanceText = daysPaid < daysRequested ? 
        ` [${daysPaid} paid + ${daysUnpaid} unpaid]` : '';
      
      await notifyManagers({
        type: 'leave_request',
        title: `Leave Request: ${employeeName || createdBy}`,
        message: `${employeeName || createdBy} requested ${leave_type} leave from ${startFormatted} to ${endFormatted}${durationText}${balanceText}.${reasonText}`,
        related_entity_type: 'leave_request',
        related_entity_id: leaveRequest.id
      });
      console.log('Notified managers about new leave request');
    } catch (notifErr) {
      console.error('Error sending leave request notifications:', notifErr);
      // Don't fail the request if notification fails
    }
    
    res.status(201).json(leaveRequest);
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

    // First get the leave request to find the employee
    const leaveRequestResult = await db.query(
      `SELECT * FROM leave_requests WHERE id = $1`,
      [id]
    );

    if (leaveRequestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    const leaveRequest = leaveRequestResult.rows[0];
    const year = new Date(leaveRequest.start_date).getFullYear();

    // Deduct or restore leave days based on status change
    if (status === 'approved' && leaveRequest.status !== 'approved' && leaveRequest.employee_id) {
      try {
        // Deduct paid days from the balance
        const daysPaid = parseFloat(leaveRequest.days_paid) || 0;
        if (daysPaid > 0) {
          await leaveBalance.deductLeaveDays(leaveRequest.employee_id, daysPaid, year);
        }
        console.log(`Deducted ${daysPaid} days from employee ${leaveRequest.employee_id}`);
      } catch (balanceErr) {
        console.warn('Could not update leave balance on approval:', balanceErr);
        // Continue anyway - don't fail the approval
      }
    } else if (status !== 'approved' && leaveRequest.status === 'approved' && leaveRequest.employee_id) {
      try {
        // Restore paid days if approval is being revoked
        const daysPaid = parseFloat(leaveRequest.days_paid) || 0;
        if (daysPaid > 0) {
          await leaveBalance.restoreLeaveDays(leaveRequest.employee_id, daysPaid, year);
        }
        console.log(`Restored ${daysPaid} days for employee ${leaveRequest.employee_id}`);
      } catch (balanceErr) {
        console.warn('Could not restore leave balance on revocation:', balanceErr);
        // Continue anyway - don't fail the status update
      }
    }

    const result = await db.query(
      `UPDATE leave_requests 
       SET status = $1, approved_by = $2, comments = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, approvedBy, comments || '', id]
    );
    
    // Notify the employee about the approval/rejection decision
    try {
      const employeeResult = await db.query(
        `SELECT id FROM employees WHERE full_name = $1`,
        [leaveRequest.employee_name]
      );

      if (employeeResult.rows.length > 0) {
        const employeeId = employeeResult.rows[0].id;
        const statusMessage = status === 'approved' ? 'approved' : 'rejected';
        const actionWord = status === 'approved' ? 'Approved' : 'Rejected';
        const balanceText = status === 'approved' && leaveRequest.days_unpaid > 0 ? 
          ` (${leaveRequest.days_paid} paid, ${leaveRequest.days_unpaid} unpaid)` : '';

        await db.query(
          `INSERT INTO notifications (
            employee_id, type, title, message, 
            related_entity_type, related_entity_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [
            employeeId,
            'leave_request',
            `Leave Request ${actionWord}`,
            `Your ${leaveRequest.leave_type} leave request has been ${statusMessage}${balanceText}. ${comments ? 'Comments: ' + comments : ''}`,
            'leave_request',
            id
          ]
        );
      }
    } catch (notifErr) {
      console.error('Error creating approval notification:', notifErr);
      // Don't fail the request if notification fails
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
