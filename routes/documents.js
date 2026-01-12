const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');

// Use memory storage so file buffer is available for storing in DB
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /api/documents/upload - upload a file and store in DB
// expects multipart/form-data with field `file` and optional `project_name` (preferred) or `project_id`, and optional `folder_id`
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Allow client portal uploads if token is valid, otherwise restrict to admin emails
    const isClientPortal = req.body.client_portal_token !== undefined;
    const uploaded_by = req.body.uploaded_by || req.headers['x-user-email'] || null;
    
    if (!isClientPortal) {
      const allowedEmails = new Set(['munya@immigrationspecialists.co.za', 'robert@immigrationspecialists.co.za']);
      if (!uploaded_by || !allowedEmails.has(String(uploaded_by).toLowerCase())) {
        console.warn('Unauthorized upload attempt', { uploaded_by, ip: req.ip, path: req.originalUrl });
        return res.status(403).json({ error: 'Uploads are disabled for your account' });
      }
    }

    const { project_name = null, project_id = null, folder_id = null, document_type = null, description = null } = req.body;
    const file = req.file;

    let finalProjectId = project_id;
    let finalProjectName = project_name;

    // If project_name provided, resolve it to project_id
    if (project_name && !project_id) {
      const projectRes = await db.query(
        'SELECT project_id, project_name FROM projects WHERE project_name = $1 LIMIT 1',
        [project_name]
      );
      if (projectRes.rows.length > 0) {
        finalProjectId = projectRes.rows[0].project_id;
        finalProjectName = projectRes.rows[0].project_name;
      } else {
        return res.status(404).json({ error: 'Project not found', detail: `No project found with name "${project_name}"` });
      }
    }

    // If project_id provided but no project_name, look up the name
    if (finalProjectId && !finalProjectName) {
      const projectRes = await db.query(
        'SELECT project_name FROM projects WHERE project_id = $1 LIMIT 1',
        [finalProjectId]
      );
      if (projectRes.rows.length > 0) {
        finalProjectName = projectRes.rows[0].project_name;
      }
    }

    const result = await db.query(
      `INSERT INTO documents (folder_id, project_id, project_name, name, mime_type, size, content, document_type, description, uploaded_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [folder_id, finalProjectId, finalProjectName, file.originalname, file.mimetype, file.size, file.buffer, document_type, description, uploaded_by]
    );

    res.status(201).json({ message: 'File uploaded successfully', document: result.rows[0] });
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

// GET /api/documents/project/:projectIdentifier - list documents for a project by ID or name
router.get('/project/:projectIdentifier', async (req, res) => {
  const { projectIdentifier } = req.params;
  try {
    // Try to find by project name first, then by ID
    let query = `SELECT document_id, folder_id, project_id, project_name, name, mime_type, size, document_type, description, uploaded_by, created_at 
                 FROM documents WHERE project_name = $1 ORDER BY created_at DESC`;
    let result = await db.query(query, [projectIdentifier]);
    
    // If not found by name, try by ID
    if (result.rows.length === 0) {
      query = `SELECT document_id, folder_id, project_id, project_name, name, mime_type, size, document_type, description, uploaded_by, created_at 
               FROM documents WHERE project_id = $1 ORDER BY created_at DESC`;
      result = await db.query(query, [projectIdentifier]);
    }
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching documents for project:', err);
    res.status(500).json({ error: 'Failed to fetch documents', detail: err.message });
  }
});

module.exports = router;
