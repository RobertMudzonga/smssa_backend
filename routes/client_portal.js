const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const crypto = require('crypto');
const { sendNotification } = require('../lib/notifications');

// Use memory storage for client portal file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper function to calculate file hash
function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

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
        const p = await db.query('SELECT * FROM projects WHERE project_id=$1 LIMIT 1', [access.project_id]);
        const project = p.rows?.[0] || null;
        return res.json({ ok: true, project, token });
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

// POST /api/client-portal/upload - allow document uploads from client portal
// Requires valid client_portal_token in body
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // File size validation
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSize) {
      return res.status(413).json({ 
        error: 'File too large', 
        detail: `File size (${(req.file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (10MB)` 
      });
    }

    const { client_portal_token, expiry_date = null } = req.body;
    if (!client_portal_token) {
      return res.status(401).json({ error: 'Invalid or missing client portal token' });
    }

    // Validate the token
    const tokenRes = await db.query(
      'SELECT * FROM client_portal_access WHERE access_token = $1 AND is_active = true LIMIT 1',
      [client_portal_token]
    );
    
    if (tokenRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired client portal token' });
    }

    const access = tokenRes.rows[0];
    if (new Date(access.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Client portal access has expired' });
    }

    // Get project information
    const projectRes = await db.query(
      'SELECT project_id, project_name FROM projects WHERE project_id = $1 LIMIT 1',
      [access.project_id]
    );

    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Associated project not found' });
    }

    const project = projectRes.rows[0];
    const { document_type = null, description = null } = req.body;
    const file = req.file;

    // Calculate file hash for deduplication
    const fileHash = calculateFileHash(file.buffer);

    // Check for duplicate file
    const duplicateCheck = await db.query(
      'SELECT document_id, name FROM documents WHERE project_id = $1 AND file_hash = $2 LIMIT 1',
      [project.project_id, fileHash]
    );
    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Duplicate file', 
        detail: `This file has already been uploaded: ${duplicateCheck.rows[0].name}`,
        existing_document_id: duplicateCheck.rows[0].document_id
      });
    }

    // Insert document record
    const result = await db.query(
      `INSERT INTO documents (project_id, project_name, name, mime_type, size, content, document_type, description, uploaded_by, file_hash, expiry_date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [project.project_id, project.project_name, file.originalname, file.mimetype, file.size, file.buffer, document_type, description, 'client_portal', fileHash, expiry_date]
    );

    const document = result.rows[0];

    // Update last_accessed_at
    await db.query('UPDATE client_portal_access SET last_accessed_at = NOW() WHERE id = $1', [access.id]).catch(() => {});

    // Send notification to project managers
    try {
      await sendNotification({
        type: 'document_uploaded',
        project_id: project.project_id,
        project_name: project.project_name,
        document_name: file.originalname,
        document_type: document_type || 'Unknown',
        message: `Client uploaded: ${file.originalname} (${document_type || 'Unknown type'})`
      });
    } catch (notifErr) {
      console.error('Failed to send notification:', notifErr);
      // Don't fail the upload if notification fails
    }

    res.status(201).json({ 
      message: 'Document uploaded successfully', 
      document,
      project_name: project.project_name
    });
  } catch (err) {
    console.error('Client portal document upload failed:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large', detail: 'Maximum file size is 10MB' });
    }
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

module.exports = router;
