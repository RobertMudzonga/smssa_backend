const express = require('express');
const router = express.Router();
const db = require('../db');

// Simple DB health check
router.get('/db', async (req, res) => {
  try {
    const result = await db.query('SELECT 1 as ok');
    return res.json({ ok: true, db: result.rows });
  } catch (err) {
    console.error('Debug DB check failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
