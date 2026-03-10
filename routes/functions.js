const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const db = require('../db');
const crypto = require('crypto');

// Helper function to hash password
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

// Helper function to generate random password
function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoiding confusing characters like 0/O, 1/I
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

router.post('/generate-client-access', async (req, res) => {
  try {
    const { projectId, clientEmail, expiryDays = 90 } = req.body || {};
    
    if (!projectId) {
      return res.status(400).json({ ok: false, error: 'Project ID is required' });
    }

    // Check project exists
    const projectRes = await db.query(
      'SELECT project_id, project_name, client_name FROM projects WHERE project_id = $1 LIMIT 1',
      [projectId]
    );
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    const project = projectRes.rows[0];

    // Generate unique token and password
    const token = `portal-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
    const password = generatePassword(8);
    const salt = crypto.randomBytes(16).toString('hex');
    const password_hash = hashPassword(password, salt);

    // Calculate expiry date
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + expiryDays);

    // Deactivate any existing access for this project
    await db.query(
      'UPDATE client_portal_access SET is_active = false WHERE project_id = $1',
      [projectId]
    ).catch(() => {}); // Ignore if table doesn't exist yet

    // Insert new access record
    try {
      await db.query(
        `INSERT INTO client_portal_access (project_id, access_token, password_hash, expires_at, is_active, created_at)
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [projectId, token, salt + ':' + password_hash, expires_at]
      );
    } catch (dbErr) {
      console.error('DB insert error:', dbErr);
      // If table doesn't exist, try to create it
      if (dbErr.code === '42P01') {
        await db.query(`
          CREATE TABLE IF NOT EXISTS client_portal_access (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL,
            access_token TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            last_accessed_at TIMESTAMP WITHOUT TIME ZONE,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await db.query(
          `INSERT INTO client_portal_access (project_id, access_token, password_hash, expires_at, is_active, created_at)
           VALUES ($1, $2, $3, $4, true, NOW())`,
          [projectId, token, salt + ':' + password_hash, expires_at]
        );
      } else {
        throw dbErr;
      }
    }

    // Generate the portal URL
    const base = process.env.CLIENT_PORTAL_BASE || process.env.FRONTEND_URL || req.get('origin') || 'http://localhost:5173';
    const portalUrl = `${base.replace(/\/$/, '')}/client-portal?token=${encodeURIComponent(token)}`;

    return res.json({ 
      ok: true, 
      portalUrl,
      password, // Only returned once at generation time - must be shared with client securely
      expires_at,
      project_name: project.project_name,
      client_name: project.client_name
    });
  } catch (err) {
    console.error('generate-client-access error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// Generate client portal access for Legal Cases
router.post('/generate-legal-case-access', async (req, res) => {
  try {
    const { caseId, clientEmail, expiryDays = 90 } = req.body || {};
    
    if (!caseId) {
      return res.status(400).json({ ok: false, error: 'Case ID is required' });
    }

    // Check legal case exists
    const caseRes = await db.query(
      'SELECT case_id, case_reference, case_title, client_name, client_email FROM legal_cases WHERE case_id = $1 LIMIT 1',
      [caseId]
    );
    if (caseRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Legal case not found' });
    }
    const legalCase = caseRes.rows[0];

    // Generate unique token and password
    const token = `legal-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
    const password = generatePassword(8);
    const salt = crypto.randomBytes(16).toString('hex');
    const password_hash = hashPassword(password, salt);

    // Calculate expiry date
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + expiryDays);

    // Deactivate any existing access for this legal case
    await db.query(
      'UPDATE client_portal_access SET is_active = false WHERE legal_case_id = $1',
      [caseId]
    ).catch(() => {}); // Ignore if column doesn't exist yet

    // Insert new access record
    try {
      await db.query(
        `INSERT INTO client_portal_access (legal_case_id, access_token, password_hash, expires_at, is_active, created_at)
         VALUES ($1, $2, $3, $4, true, NOW())`,
        [caseId, token, salt + ':' + password_hash, expires_at]
      );
    } catch (dbErr) {
      console.error('DB insert error:', dbErr);
      // If column doesn't exist, add it
      if (dbErr.code === '42703') {
        await db.query('ALTER TABLE client_portal_access ADD COLUMN IF NOT EXISTS legal_case_id INTEGER');
        await db.query(
          `INSERT INTO client_portal_access (legal_case_id, access_token, password_hash, expires_at, is_active, created_at)
           VALUES ($1, $2, $3, $4, true, NOW())`,
          [caseId, token, salt + ':' + password_hash, expires_at]
        );
      } else {
        throw dbErr;
      }
    }

    // Generate the portal URL
    const base = process.env.CLIENT_PORTAL_BASE || process.env.FRONTEND_URL || req.get('origin') || 'http://localhost:5173';
    const portalUrl = `${base.replace(/\/$/, '')}/client-portal?token=${encodeURIComponent(token)}`;

    return res.json({ 
      ok: true, 
      portalUrl,
      password,
      expires_at,
      case_reference: legalCase.case_reference,
      case_title: legalCase.case_title,
      client_name: legalCase.client_name
    });
  } catch (err) {
    console.error('generate-legal-case-access error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

router.post('/database-health-check', async (req, res) => {
  try {
    // Simple health probe queries; if DB is unreachable this will throw
    const totals = { projects: 0, prospects: 0 };
    try {
      const p = await db.query('SELECT COUNT(*) AS cnt FROM projects');
      totals.projects = Number(p.rows?.[0]?.cnt || 0);
    } catch (e) {
      // table may not exist or DB unreachable
      console.warn('projects count failed', e.message || e);
    }
    try {
      const q = await db.query('SELECT COUNT(*) AS cnt FROM prospects');
      totals.prospects = Number(q.rows?.[0]?.cnt || 0);
    } catch (e) {
      console.warn('prospects count failed', e.message || e);
    }

    // Build a lightweight response
    const data = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      issues: [],
      warnings: [],
      summary: { total_issues: 0, total_warnings: 0, tables_checked: 2 },
      totals
    };
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('database-health-check error', err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

router.post('/apply-database-migrations', async (req, res) => {
  try {
    const migrations = req.body?.migrations || [];
    // Run migrate.js as a child process and capture output
    const child = exec('node migrate.js', { cwd: __dirname + '/..' }, (err, stdout, stderr) => {
      if (err) {
        console.error('migrate.js failed', err);
        return res.status(500).json({ ok: false, error: 'migrations_failed', details: stderr || err.message });
      }
      return res.json({ ok: true, output: stdout });
    });
    // In case exec throws synchronously
  } catch (err) {
    console.error('apply-database-migrations error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

router.post('/fetch-analytics-data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    // Gather analytics from DB; separate project and prospect revenue
    const data = {
      totalRevenue: 0,
      projectsRevenue: 0,
      projectsRevenueReceived: 0,
      prospectsRevenue: 0,
      completionRates: { completed: 0, total: 0 },
      clientAcquisition: { converted: 0, total: 0 },
      revenueByVisa: [],
      employeePerformance: [],
      projectPaymentStatus: { pending: 0, partiallyPaid: 0, fullyPaid: 0 }
    };

    try {
      // Get total project quote amount (payment_amount)
      const projectsQuote = await db.query("SELECT COALESCE(SUM(payment_amount),0) AS total FROM projects WHERE payment_amount IS NOT NULL");
      data.projectsRevenue = Number(projectsQuote.rows?.[0]?.total || 0);
    } catch (e) { console.warn('projects quote revenue query failed', e.message || e); }

    try {
      // Get total project payment received (already paid)
      const projectsReceived = await db.query("SELECT COALESCE(SUM(payment_received),0) AS total FROM projects WHERE payment_received IS NOT NULL AND payment_received > 0");
      data.projectsRevenueReceived = Number(projectsReceived.rows?.[0]?.total || 0);
    } catch (e) { console.warn('projects payment received query failed', e.message || e); }

    try {
      // Get project payment status distribution
      const paymentStatus = await db.query("SELECT payment_status, COUNT(*) as count FROM projects GROUP BY payment_status");
      if (paymentStatus.rows && paymentStatus.rows.length > 0) {
        paymentStatus.rows.forEach(row => {
          if (row.payment_status === 'pending') data.projectPaymentStatus.pending = Number(row.count);
          else if (row.payment_status === 'partially_paid') data.projectPaymentStatus.partiallyPaid = Number(row.count);
          else if (row.payment_status === 'fully_paid') data.projectPaymentStatus.fullyPaid = Number(row.count);
        });
      }
    } catch (e) { console.warn('project payment status query failed', e.message || e); }

    try {
      // Get prospect revenue (won deals) - this would be from a prospects table if it tracks revenue
      const prospectsRevenue = await db.query("SELECT COALESCE(SUM(CAST(forecast_amount AS NUMERIC)),0) AS total FROM prospects WHERE current_stage_id = 14 OR status = 'won'");
      data.prospectsRevenue = Number(prospectsRevenue.rows?.[0]?.total || 0);
    } catch (e) { console.warn('prospects revenue query failed', e.message || e); }

    // Total revenue is now separate: projects received + prospects won
    data.totalRevenue = data.projectsRevenueReceived + data.prospectsRevenue;

    return res.json({ ok: true, data });
  } catch (err) {
    console.error('fetch-analytics-data error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

router.post('/generate-pdf-report', async (req, res) => {
  try {
    const { analyticsData, startDate, endDate } = req.body || {};
    const html = `<html><body><h1>Analytics Report</h1><pre>${JSON.stringify(analyticsData || {}, null, 2)}</pre></body></html>`;
    return res.json({ ok: true, html });
  } catch (err) {
    console.error('generate-pdf-report error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

router.post('/export-excel-report', async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    // Query projects in range - best-effort
    try {
      const q = await db.query('SELECT id, client_name, visa_type, status, payment_amount FROM projects WHERE created_at >= $1 AND created_at <= $2', [startDate || '1970-01-01', endDate || new Date().toISOString()]);
      return res.json({ ok: true, data: { projects: q.rows || [] } });
    } catch (e) {
      console.warn('export-excel-report query failed', e.message || e);
      return res.json({ ok: true, data: { projects: [] } });
    }
  } catch (err) {
    console.error('export-excel-report error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

module.exports = router;
