const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../db');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function parseVariables(input) {
  if (input === undefined || input === null) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
    return input
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

router.get('/', async (req, res) => {
  try {
    const q = await db.query(
      `SELECT id, name, description, category, content, variables, created_at, file_name, file_mime, file_size, storage_type,
              (file_data IS NOT NULL) AS has_file
       FROM document_templates
       WHERE is_active = true
       ORDER BY category, name`
    );
    const templates = (q.rows || []).map((t) => ({
      ...t,
      download_url: t.has_file ? `/api/templates/${t.id}/download` : null,
    }));
    return res.json({ ok: true, templates });
  } catch (err) {
    console.error('GET /api/templates error', err.message || err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const q = await db.query(
      `SELECT id, name, description, category, content, variables, created_at, updated_at,
              file_name, file_mime, file_size, storage_type, (file_data IS NOT NULL) AS has_file
       FROM document_templates
       WHERE id = $1 AND is_active = true
       LIMIT 1`,
      [id]
    );
    if (!q.rows?.length) return res.status(404).json({ ok: false, error: 'not_found' });
    const tpl = q.rows[0];
    return res.json({ ok: true, template: { ...tpl, download_url: tpl.has_file ? `/api/templates/${tpl.id}/download` : null } });
  } catch (err) {
    console.error('GET /api/templates/:id error', err.message || err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { name, description, category = 'General' } = req.body || {};
    const variables = parseVariables(req.body?.variables);
    const file = req.file;

    const storageType = file ? 'file' : 'text';
    const content = storageType === 'text' ? req.body?.content || null : null;

    if (!name) return res.status(400).json({ ok: false, error: 'name_required' });
    if (!content && !file) return res.status(400).json({ ok: false, error: 'content_or_file_required' });

    const q = await db.query(
      `INSERT INTO document_templates
        (name, description, category, content, variables, is_active, created_at, updated_at, file_name, file_mime, file_size, file_data, storage_type)
       VALUES ($1,$2,$3,$4,$5, true, NOW(), NOW(), $6,$7,$8,$9,$10)
       RETURNING id`,
      [
        name,
        description,
        category,
        content,
        variables,
        file ? file.originalname : null,
        file ? file.mimetype : null,
        file ? file.size : null,
        file ? file.buffer : null,
        storageType,
      ]
    );
    return res.json({ ok: true, id: q.rows?.[0]?.id });
  } catch (err) {
    console.error('POST /api/templates error', err.message || err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

router.patch('/:id', upload.single('file'), async (req, res) => {
  try {
    const id = req.params.id;
    const { name, description, category } = req.body || {};
    const hasVariables = req.body && Object.prototype.hasOwnProperty.call(req.body, 'variables');
    const variables = hasVariables ? parseVariables(req.body.variables) : null;
    const hasContent = req.body && Object.prototype.hasOwnProperty.call(req.body, 'content');
    const file = req.file;

    const storageType = file ? 'file' : req.body?.storage_type || null;
    const content = file ? null : hasContent ? req.body.content || null : null;

    await db.query(
      `UPDATE document_templates SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         content = CASE WHEN $12 THEN $4 ELSE content END,
         variables = CASE WHEN $13 THEN $5 ELSE variables END,
         file_name = COALESCE($6, file_name),
         file_mime = COALESCE($7, file_mime),
         file_size = COALESCE($8, file_size),
         file_data = COALESCE($9, file_data),
         storage_type = COALESCE($10, storage_type),
         updated_at = NOW()
       WHERE id=$11`,
      [
        name,
        description,
        category,
        content,
        variables,
        file ? file.originalname : null,
        file ? file.mimetype : null,
        file ? file.size : null,
        file ? file.buffer : null,
        storageType,
        id,
        file ? true : hasContent,
        hasVariables,
      ]
    );
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

router.get('/:id/download', async (req, res) => {
  try {
    const id = req.params.id;
    const q = await db.query('SELECT file_name, file_mime, file_data FROM document_templates WHERE id = $1 AND is_active = true', [id]);
    if (!q.rows?.length || !q.rows[0].file_data) {
      return res.status(404).json({ ok: false, error: 'file_not_found' });
    }
    const row = q.rows[0];
    res.setHeader('Content-Type', row.file_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${(row.file_name || 'template').replace(/"/g, '')}"`);
    return res.send(row.file_data);
  } catch (err) {
    console.error('GET /api/templates/:id/download error', err.message || err);
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
      await db.query(
        `INSERT INTO document_templates (name, description, category, content, variables, is_active, created_at)
         VALUES ($1,$2,$3,$4,$5, true, NOW())
         ON CONFLICT (category, name) DO UPDATE
         SET description = EXCLUDED.description,
             content = EXCLUDED.content,
             variables = EXCLUDED.variables,
             is_active = true,
             updated_at = NOW()`,
        [s.name, s.description, s.category, s.content, s.variables]
      );
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/templates/seed error', err.message || err);
    return res.status(500).json({ ok: false, error: 'database_unavailable' });
  }
});

module.exports = router;
