const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/client-portal/validate?token=...
router.get('/validate', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'missing_token' });
  try {
    try {
      const q = await db.query('SELECT * FROM client_portal_access WHERE access_token=$1 AND is_active = true LIMIT 1', [token]);
      const access = q.rows?.[0] || null;
      if (!access) return res.status(404).json({ error: 'invalid_or_expired' });
      if (new Date(access.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });
      // update last_accessed_at
      await db.query('UPDATE client_portal_access SET last_accessed_at = NOW() WHERE id = $1', [access.id]).catch(() => {});
      // load project
      try {
        const p = await db.query('SELECT * FROM projects WHERE id=$1 LIMIT 1', [access.project_id]);
        const project = p.rows?.[0] || null;
        return res.json({ ok: true, project });
      } catch (pe) {
        console.warn('project load failed', pe.message || pe);
        return res.status(503).json({ ok: false, error: 'database_unavailable' });
      }
    } catch (e) {
      console.warn('client_portal validate DB read failed', e.message || e);
      return res.status(503).json({ ok: false, error: 'database_unavailable' });
    }
  } catch (err) {
    console.error('Client portal validate error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

module.exports = router;
