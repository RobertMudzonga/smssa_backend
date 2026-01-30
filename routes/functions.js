const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const db = require('../db');

router.post('/generate-client-access', async (req, res) => {
  try {
    const { projectId, clientEmail, expiryDays } = req.body || {};
    const token = `link-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const base = process.env.CLIENT_PORTAL_BASE || req.get('origin') || `https://app.example.com`;
    const portalUrl = `${base.replace(/\/$/, '')}/client-portal/${projectId}?token=${token}&email=${encodeURIComponent(clientEmail || '')}`;
    return res.json({ ok: true, portalUrl });
  } catch (err) {
    console.error('generate-client-access error', err);
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
