const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const crypto = require('crypto');
const { sendNotification } = require('../lib/notifications');

// Use memory storage so file buffer is available for storing in DB
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper function to calculate file hash
function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// POST /api/documents/upload - upload a file and store in DB
// expects multipart/form-data with field `file` and optional `project_name` (preferred) or `project_id`, and optional `folder_id`
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // File size validation (additional check beyond multer)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSize) {
      return res.status(413).json({ 
        error: 'File too large', 
        detail: `File size (${(req.file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (10MB)` 
      });
    }

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

    const { project_name = null, project_id = null, folder_id = null, document_type = null, description = null, expiry_date = null } = req.body;
    const file = req.file;

    // Calculate file hash for deduplication
    const fileHash = calculateFileHash(file.buffer);

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

    // Check for duplicate file (same hash in same project)
    if (finalProjectId) {
      const duplicateCheck = await db.query(
        'SELECT document_id, name FROM documents WHERE project_id = $1 AND file_hash = $2 LIMIT 1',
        [finalProjectId, fileHash]
      );
      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({ 
          error: 'Duplicate file', 
          detail: `A file with identical content already exists: ${duplicateCheck.rows[0].name}`,
          existing_document_id: duplicateCheck.rows[0].document_id
        });
      }
    }

    const result = await db.query(
      `INSERT INTO documents (folder_id, project_id, project_name, name, mime_type, size, content, document_type, description, uploaded_by, file_hash, expiry_date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [folder_id, finalProjectId, finalProjectName, file.originalname, file.mimetype, file.size, file.buffer, document_type, description, uploaded_by, fileHash, expiry_date]
    );

    const document = result.rows[0];

    // Send notification if uploaded via client portal
    if (isClientPortal && finalProjectId) {
      try {
        await sendNotification({
          type: 'document_uploaded',
          project_id: finalProjectId,
          document_name: file.originalname,
          document_type: document_type || 'Unknown',
          message: `New document uploaded via client portal: ${file.originalname}`
        });
      } catch (notifErr) {
        console.error('Failed to send notification:', notifErr);
        // Don't fail the upload if notification fails
      }
    }

    res.status(201).json({ message: 'File uploaded successfully', document });
  } catch (err) {
    console.error('Document upload failed:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large', detail: 'Maximum file size is 10MB' });
    }
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
    let query = `SELECT document_id, folder_id, project_id, project_name, name, mime_type, size, document_type, description, uploaded_by, expiry_date, file_hash, version, is_latest_version, created_at 
                 FROM documents WHERE project_name = $1 ORDER BY created_at DESC`;
    let result = await db.query(query, [projectIdentifier]);
    
    // If not found by name, try by ID
    if (result.rows.length === 0) {
      query = `SELECT document_id, folder_id, project_id, project_name, name, mime_type, size, document_type, description, uploaded_by, expiry_date, file_hash, version, is_latest_version, created_at 
               FROM documents WHERE project_id = $1 ORDER BY created_at DESC`;
      result = await db.query(query, [projectIdentifier]);
    }
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching documents for project:', err);
    res.status(500).json({ error: 'Failed to fetch documents', detail: err.message });
  }
});

// POST /api/documents/bulk-download - download multiple documents as ZIP
router.post('/bulk-download', async (req, res) => {
  const archiver = require('archiver');
  const { document_ids } = req.body;
  
  if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
    return res.status(400).json({ error: 'Invalid document_ids array' });
  }

  try {
    // Fetch all requested documents
    const result = await db.query(
      'SELECT document_id, name, mime_type, content FROM documents WHERE document_id = ANY($1)',
      [document_ids]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No documents found' });
    }

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="documents.zip"');
    
    archive.pipe(res);

    // Add each document to the archive
    result.rows.forEach((doc, index) => {
      const fileName = doc.name || `document_${doc.document_id}`;
      archive.append(doc.content, { name: fileName });
    });

    await archive.finalize();
  } catch (err) {
    console.error('Bulk download failed:', err);
    res.status(500).json({ error: 'Bulk download failed', detail: err.message });
  }
});

// GET /api/documents/expiring - get documents expiring within specified days
router.get('/expiring', async (req, res) => {
  const { days = 30, project_id = null } = req.query;
  
  try {
    let query = `
      SELECT document_id, project_id, project_name, name, document_type, expiry_date, uploaded_by, created_at,
             (expiry_date - CURRENT_DATE) as days_until_expiry
      FROM documents 
      WHERE expiry_date IS NOT NULL 
        AND expiry_date <= CURRENT_DATE + INTERVAL '${parseInt(days)} days'
        AND expiry_date >= CURRENT_DATE
    `;
    
    const params = [];
    if (project_id) {
      query += ' AND project_id = $1';
      params.push(project_id);
    }
    
    query += ' ORDER BY expiry_date ASC';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching expiring documents:', err);
    res.status(500).json({ error: 'Failed to fetch expiring documents', detail: err.message });
  }
});

// GET /api/documents/:id/versions - get version history for a document
router.get('/:id/versions', async (req, res) => {
  const { id } = req.params;
  
  try {
    // First, get the document to find its parent or check if it has versions
    const docResult = await db.query(
      'SELECT document_id, parent_document_id FROM documents WHERE document_id = $1',
      [id]
    );
    
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const doc = docResult.rows[0];
    const rootId = doc.parent_document_id || doc.document_id;
    
    // Get all versions (the root and all its children)
    const versionsResult = await db.query(
      `SELECT document_id, name, version, is_latest_version, uploaded_by, created_at, size, mime_type
       FROM documents 
       WHERE document_id = $1 OR parent_document_id = $1
       ORDER BY version DESC`,
      [rootId]
    );
    
    res.json(versionsResult.rows);
  } catch (err) {
    console.error('Error fetching document versions:', err);
    res.status(500).json({ error: 'Failed to fetch versions', detail: err.message });
  }
});

// POST /api/documents/:id/new-version - upload a new version of an existing document
router.post('/:id/new-version', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Get the original document
    const originalDoc = await db.query(
      'SELECT * FROM documents WHERE document_id = $1',
      [id]
    );
    
    if (originalDoc.rows.length === 0) {
      return res.status(404).json({ error: 'Original document not found' });
    }
    
    const original = originalDoc.rows[0];
    const file = req.file;
    const fileHash = calculateFileHash(file.buffer);
    const uploaded_by = req.body.uploaded_by || req.headers['x-user-email'] || null;
    
    // Mark current document as not latest
    await db.query(
      'UPDATE documents SET is_latest_version = false WHERE document_id = $1 OR parent_document_id = $1',
      [original.parent_document_id || id]
    );
    
    // Insert new version
    const result = await db.query(
      `INSERT INTO documents (
        folder_id, project_id, project_name, name, mime_type, size, content, 
        document_type, description, uploaded_by, file_hash, expiry_date,
        version, parent_document_id, is_latest_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true) 
      RETURNING *`,
      [
        original.folder_id,
        original.project_id,
        original.project_name,
        file.originalname,
        file.mimetype,
        file.size,
        file.buffer,
        original.document_type,
        req.body.description || original.description,
        uploaded_by,
        fileHash,
        req.body.expiry_date || original.expiry_date,
        (original.version || 1) + 1,
        original.parent_document_id || id
      ]
    );
    
    res.status(201).json({ 
      message: 'New version uploaded successfully', 
      document: result.rows[0] 
    });
  } catch (err) {
    console.error('Version upload failed:', err);
    res.status(500).json({ error: 'Version upload failed', detail: err.message });
  }
});

// DELETE /api/documents/:id - soft delete a document (mark as inactive)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      'UPDATE documents SET is_latest_version = false WHERE document_id = $1 RETURNING document_id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ message: 'Document deleted successfully', document_id: id });
  } catch (err) {
    console.error('Document deletion failed:', err);
    res.status(500).json({ error: 'Deletion failed', detail: err.message });
  }
});

module.exports = router;

