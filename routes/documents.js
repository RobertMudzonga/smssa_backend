const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');

// Use memory storage so file buffer is available for storing in DB
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /api/documents/upload - upload a file and store in DB
// expects multipart/form-data with field `file` and optional `project_id` and `folder_id`
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Restrict upload endpoint to specific admin emails only
    const allowedEmails = new Set(['munya@immigrationspecialists.co.za', 'robert@immigrationspecialists.co.za']);
    const uploaded_by = req.body.uploaded_by || req.headers['x-user-email'] || null;
    if (!uploaded_by || !allowedEmails.has(String(uploaded_by).toLowerCase())) {
      console.warn('Unauthorized upload attempt', { uploaded_by, ip: req.ip, path: req.originalUrl });
      return res.status(403).json({ error: 'Uploads are disabled for your account' });
    }

    const { project_id = null, folder_id = null } = req.body;
    const file = req.file;

    const result = await db.query(
      `INSERT INTO documents (folder_id, project_id, name, mime_type, size, content, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [folder_id, project_id, file.originalname, file.mimetype, file.size, file.buffer, uploaded_by]
    );

    res.status(201).json({ message: 'File uploaded', document: result.rows[0] });
  } catch (err) {
    console.error('Document upload failed:', err);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

// GET /api/documents/:id/download - download file by id
router.get('/:id/download', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('SELECT name, mime_type, content FROM documents WHERE document_id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.name.replace(/\"/g, '')}"`);
    res.send(doc.content);
  } catch (err) {
    console.error('Document download failed:', err);
    res.status(500).json({ error: 'Download failed', detail: err.message });
  }
});

module.exports = router;

// --- Additional listing endpoints ---
// GET /api/documents/folders/project/:projectId - list folders for a project
router.get('/folders/project/:projectId', async (req, res) => {
  const { projectId } = req.params;
  try {
    const result = await db.query('SELECT * FROM document_folders WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching folders for project:', err);
    res.status(500).json({ error: 'Failed to fetch folders', detail: err.message });
  }
});

// GET /api/documents/folders/:folderId/documents - list documents in a folder
router.get('/folders/:folderId/documents', async (req, res) => {
  const { folderId } = req.params;
  try {
    const result = await db.query('SELECT document_id, name, mime_type, size, uploaded_by, created_at FROM documents WHERE folder_id = $1 ORDER BY created_at DESC', [folderId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching documents for folder:', err);
    res.status(500).json({ error: 'Failed to fetch documents', detail: err.message });
  }
});

// GET /api/documents/project/:projectId - list documents for a project (across folders)
router.get('/project/:projectId', async (req, res) => {
  const { projectId } = req.params;
  try {
    const result = await db.query('SELECT document_id, folder_id, name, mime_type, size, uploaded_by, created_at FROM documents WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching documents for project:', err);
    res.status(500).json({ error: 'Failed to fetch documents', detail: err.message });
  }
});
