const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const q = await db.query('SELECT id, name, description, category, content, variables, created_at FROM document_templates WHERE is_active = true ORDER BY category, name');
    return res.json({ ok: true, templates: q.rows || [] });
  } catch (err) {
    console.error('GET /api/templates error', err.message || err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, category, content, variables } = req.body || {};
    const q = await db.query('INSERT INTO document_templates (name, description, category, content, variables, is_active, created_at) VALUES ($1,$2,$3,$4,$5, true, NOW()) RETURNING id', [name, description, category, content, variables]);
    return res.json({ ok: true, id: q.rows?.[0]?.id });
  } catch (err) {
    console.error('POST /api/templates error', err.message || err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { name, description, category, content, variables } = req.body || {};
    await db.query('UPDATE document_templates SET name=$1, description=$2, category=$3, content=$4, variables=$5, updated_at=NOW() WHERE id=$6', [name, description, category, content, variables, id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/templates/:id error', err.message || err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

router.patch('/:id/deactivate', async (req, res) => {
  try {
    const id = req.params.id;
    await db.query('UPDATE document_templates SET is_active = false WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/templates/:id/deactivate error', err.message || err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

router.post('/seed', async (req, res) => {
  try {
    const samples = [
      { name: 'Welcome Letter', description: 'Client welcome letter', category: 'Client', content: 'Dear {{client_name}}, welcome', variables: ['client_name'] },
      { name: 'Invoice', description: 'Payment invoice', category: 'Finance', content: 'Invoice for {{amount}}', variables: ['amount'] }
    ];
    for (const s of samples) {
      await db.query('INSERT INTO document_templates (name, description, category, content, variables, is_active, created_at) VALUES ($1,$2,$3,$4,$5, true, NOW())', [s.name, s.description, s.category, s.content, s.variables]);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/templates/seed error', err.message || err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

module.exports = router;
