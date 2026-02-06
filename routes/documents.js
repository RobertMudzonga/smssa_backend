const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const crypto = require('crypto');
const { sendNotification } = require('../lib/notifications');
const { v4: uuidv4 } = require('uuid');

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

// Helper function to decide document name
function resolveDocumentName(file, documentName) {
  if (documentName && typeof documentName === 'string' && documentName.trim().length > 0) {
    return documentName.trim();
  }
  return file.originalname;
}

// Helper function to generate unique document ID
function generateUniqueDocId() {
  return 'DOC-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + 
         Math.floor(Math.random() * 999999).toString().padStart(6, '0');
}

// Helper function to log document activity
async function logDocumentActivity(documentId, actionType, performedBy, details = {}, ipAddress = null) {
  try {
    await db.query(
      `INSERT INTO document_activity_log (document_id, action_type, performed_by, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [documentId, actionType, performedBy, JSON.stringify(details), ipAddress]
    );
  } catch (err) {
    console.error('Failed to log document activity:', err);
  }
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

    // Allow all users to upload documents (including client portal)
    const isClientPortal = req.body.client_portal_token !== undefined;
    const uploaded_by = req.body.uploaded_by || req.headers['x-user-email'] || null;

    const { project_name = null, project_id = null, folder_id = null, document_type = null, description = null, expiry_date = null, document_name = null } = req.body;
    const file = req.file;
    const resolvedName = resolveDocumentName(file, document_name);

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
      `INSERT INTO documents (folder_id, project_id, project_name, name, mime_type, size, content, document_type, description, uploaded_by, file_hash, expiry_date, unique_doc_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, generate_unique_doc_id()) RETURNING *`,
      [folder_id, finalProjectId, finalProjectName, resolvedName, file.mimetype, file.size, file.buffer, document_type, description, uploaded_by, fileHash, expiry_date]
    );

    const document = result.rows[0];

    // Send notification if uploaded via client portal
    if (isClientPortal && finalProjectId) {
      try {
        await sendNotification({
          type: 'document_uploaded',
          project_id: finalProjectId,
          document_name: resolvedName,
          document_type: document_type || 'Unknown',
          message: `New document uploaded via client portal: ${resolvedName}`
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

// POST /api/documents/bulk-upload - upload multiple files and store in DB
// expects multipart/form-data with field `files` and optional `project_name` (preferred) or `project_id`, and optional `folder_id`
router.post('/bulk-upload', upload.array('files'), async (req, res) => {
  try {
    const files = req.files || [];
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Allow all users to upload documents (including client portal)
    const isClientPortal = req.body.client_portal_token !== undefined;
    const uploaded_by = req.body.uploaded_by || req.headers['x-user-email'] || null;

    const { project_name = null, project_id = null, folder_id = null, document_type = null, description = null, expiry_date = null, document_name = null } = req.body;

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

    const uploaded = [];
    const failed = [];

    for (const file of files) {
      try {
        // File size validation (additional check beyond multer)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
          throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum allowed size is 10MB.`);
        }

        const resolvedName = resolveDocumentName(file, files.length === 1 ? document_name : null);

        // Calculate file hash for deduplication
        const fileHash = calculateFileHash(file.buffer);

        // Check for duplicate file (same hash in same project)
        if (finalProjectId) {
          const duplicateCheck = await db.query(
            'SELECT document_id, name FROM documents WHERE project_id = $1 AND file_hash = $2 LIMIT 1',
            [finalProjectId, fileHash]
          );
          if (duplicateCheck.rows.length > 0) {
            throw new Error(`Duplicate file detected: ${duplicateCheck.rows[0].name}`);
          }
        }

        const result = await db.query(
          `INSERT INTO documents (folder_id, project_id, project_name, name, mime_type, size, content, document_type, description, uploaded_by, file_hash, expiry_date, unique_doc_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, generate_unique_doc_id()) RETURNING *`,
          [folder_id, finalProjectId, finalProjectName, resolvedName, file.mimetype, file.size, file.buffer, document_type, description, uploaded_by, fileHash, expiry_date]
        );

        const document = result.rows[0];
        uploaded.push(document);

        if (isClientPortal && finalProjectId) {
          try {
            await sendNotification({
              type: 'document_uploaded',
              project_id: finalProjectId,
              document_name: resolvedName,
              document_type: document_type || 'Unknown',
              message: `New document uploaded via client portal: ${resolvedName}`
            });
          } catch (notifErr) {
            console.error('Failed to send notification:', notifErr);
          }
        }
      } catch (fileErr) {
        failed.push({
          file_name: file.originalname,
          error: fileErr.message || 'Upload failed'
        });
      }
    }

    const status = failed.length > 0 ? 207 : 201;
    res.status(status).json({
      message: failed.length > 0 ? 'Bulk upload completed with errors' : 'Bulk upload completed',
      uploaded,
      failed
    });
  } catch (err) {
    console.error('Bulk document upload failed:', err);
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
    const result = await db.query(`
      SELECT 
        document_id, 
        unique_doc_id,
        name, 
        mime_type, 
        size, 
        uploaded_by, 
        created_at,
        updated_at,
        project_id,
        project_name,
        status,
        checked_out_by,
        checked_out_at
      FROM documents 
      WHERE folder_id = $1 
      ORDER BY created_at DESC
    `, [folderId]);
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
    let query = `SELECT 
                   document_id, 
                   unique_doc_id,
                   folder_id, 
                   project_id, 
                   project_name, 
                   name, 
                   mime_type, 
                   size, 
                   document_type, 
                   description, 
                   uploaded_by, 
                   expiry_date, 
                   file_hash, 
                   status,
                   checked_out_by,
                   checked_out_at,
                   created_at,
                   updated_at
                 FROM documents 
                 WHERE project_name = $1 
                 ORDER BY created_at DESC`;
    let result = await db.query(query, [projectIdentifier]);
    
    // If not found by name, try by ID
    if (result.rows.length === 0) {
      query = `SELECT 
                 document_id, 
                 unique_doc_id,
                 folder_id, 
                 project_id, 
                 project_name, 
                 name, 
                 mime_type, 
                 size, 
                 document_type, 
                 description, 
                 uploaded_by, 
                 expiry_date, 
                 file_hash, 
                 status,
                 checked_out_by,
                 checked_out_at,
                 created_at,
                 updated_at
               FROM documents 
               WHERE project_id = $1 
               ORDER BY created_at DESC`;
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

// DELETE /api/documents/:id - delete a document and all its versions
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // First, find the parent document ID if this is a version
    const docRes = await db.query(
      'SELECT parent_document_id FROM documents WHERE document_id = $1',
      [id]
    );
    
    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const parentId = docRes.rows[0].parent_document_id;
    
    // If this is a version (has parent), delete just this version
    // If this is a parent, delete the document and all its versions
    if (parentId) {
      // Delete just this version
      await db.query('DELETE FROM documents WHERE document_id = $1', [id]);
    } else {
      // Delete the document and all its versions
      await db.query(
        'DELETE FROM documents WHERE document_id = $1 OR parent_document_id = $1',
        [id]
      );
    }
    
    res.json({ message: 'Document deleted successfully', document_id: id });
  } catch (err) {
    console.error('Document deletion failed:', err);
    res.status(500).json({ error: 'Deletion failed', detail: err.message });
  }
});

// ===== NEW DOCUMENT MANAGEMENT SYSTEM ENDPOINTS =====

// POST /api/documents/:id/check-out - Check out a document
router.post('/:id/check-out', async (req, res) => {
  const { id } = req.params;
  const { checked_out_by, due_date } = req.body;
  
  try {
    if (!checked_out_by) {
      return res.status(400).json({ error: 'checked_out_by is required' });
    }

    // Update document status to checked_out
    const result = await db.query(
      `UPDATE documents 
       SET status = 'checked_out', checked_out_by = $1, checked_out_at = CURRENT_TIMESTAMP, 
           check_in_due_date = $2, updated_at = CURRENT_TIMESTAMP
       WHERE document_id = $3 AND status = 'available'
       RETURNING *`,
      [checked_out_by, due_date || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ 
        error: 'Document cannot be checked out', 
        detail: 'Document is not available or already checked out' 
      });
    }

    const document = result.rows[0];
    
    // Log activity
    await logDocumentActivity(id, 'checked_out', checked_out_by, { 
      due_date: due_date 
    });

    // Send notification
    try {
      await sendNotification({
        type: 'document_checked_out',
        document_id: id,
        document_name: document.name,
        checked_out_by: checked_out_by,
        message: `Document "${document.name}" has been checked out by ${checked_out_by}`
      });
    } catch (err) {
      console.error('Notification failed:', err);
    }

    res.json({ message: 'Document checked out successfully', document });
  } catch (err) {
    console.error('Check-out failed:', err);
    res.status(500).json({ error: 'Check-out failed', detail: err.message });
  }
});

// POST /api/documents/:id/check-in - Check in a document
router.post('/:id/check-in', async (req, res) => {
  const { id } = req.params;
  const { checked_in_by } = req.body;

  try {
    if (!checked_in_by) {
      return res.status(400).json({ error: 'checked_in_by is required' });
    }

    // Update document status back to available
    const result = await db.query(
      `UPDATE documents 
       SET status = 'available', checked_out_by = NULL, checked_out_at = NULL, 
           check_in_due_date = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE document_id = $1 AND status = 'checked_out'
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ 
        error: 'Document cannot be checked in', 
        detail: 'Document is not currently checked out' 
      });
    }

    const document = result.rows[0];

    // Log activity
    await logDocumentActivity(id, 'checked_in', checked_in_by);

    // Send notification
    try {
      await sendNotification({
        type: 'document_checked_in',
        document_id: id,
        document_name: document.name,
        checked_in_by: checked_in_by,
        message: `Document "${document.name}" has been checked in by ${checked_in_by}`
      });
    } catch (err) {
      console.error('Notification failed:', err);
    }

    res.json({ message: 'Document checked in successfully', document });
  } catch (err) {
    console.error('Check-in failed:', err);
    res.status(500).json({ error: 'Check-in failed', detail: err.message });
  }
});

// GET /api/documents/:id/profile - Get document profile (metadata)
router.get('/:id/profile', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT * FROM document_profiles WHERE document_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document profile not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching document profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile', detail: err.message });
  }
});

// POST /api/documents/:id/profile - Create or update document profile
router.post('/:id/profile', async (req, res) => {
  const { id } = req.params;
  const {
    title,
    author,
    subject,
    keywords,
    content_summary,
    language,
    pages,
    created_date,
    classification,
    retention_period_months,
    template_variables
  } = req.body;

  try {
    // Check if profile exists
    const existingProfile = await db.query(
      'SELECT * FROM document_profiles WHERE document_id = $1',
      [id]
    );

    let result;
    if (existingProfile.rows.length > 0) {
      // Update existing profile
      result = await db.query(
        `UPDATE document_profiles
         SET title = $1, author = $2, subject = $3, keywords = $4, 
             content_summary = $5, language = $6, pages = $7, created_date = $8,
             classification = $9, retention_period_months = $10, 
             template_variables = $11, updated_at = CURRENT_TIMESTAMP
         WHERE document_id = $12
         RETURNING *`,
        [title, author, subject, keywords, content_summary, language, pages, 
         created_date, classification, retention_period_months, 
         template_variables ? JSON.stringify(template_variables) : null, id]
      );
    } else {
      // Create new profile
      result = await db.query(
        `INSERT INTO document_profiles 
         (document_id, title, author, subject, keywords, content_summary, language,
          pages, created_date, classification, retention_period_months, template_variables)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [id, title, author, subject, keywords, content_summary, language, pages,
         created_date, classification, retention_period_months,
         template_variables ? JSON.stringify(template_variables) : null]
      );
    }

    // Log activity
    await logDocumentActivity(id, 'profile_updated', req.body.updated_by || 'system', {
      title, author, subject, classification
    });

    res.status(201).json({ 
      message: 'Document profile saved successfully', 
      profile: result.rows[0] 
    });
  } catch (err) {
    console.error('Failed to save document profile:', err);
    res.status(500).json({ error: 'Failed to save profile', detail: err.message });
  }
});

// POST /api/documents/:id/share - Create a shareable link for external access
router.post('/:id/share', async (req, res) => {
  const { id } = req.params;
  const { shared_by, permission_type = 'view', expires_at, client_email } = req.body;

  try {
    if (!shared_by) {
      return res.status(400).json({ error: 'shared_by is required' });
    }

    // Generate unique share token
    const shareToken = uuidv4();

    // Create share record
    const result = await db.query(
      `INSERT INTO document_access_shares 
       (document_id, share_token, shared_by, permission_type, expires_at, client_email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [id, shareToken, shared_by, permission_type, expires_at || null, client_email || null]
    );

    // Log activity
    await logDocumentActivity(id, 'shared', shared_by, {
      permission_type,
      client_email,
      expires_at
    });

    // Send notification if client_email provided
    if (client_email) {
      try {
        await sendNotification({
          type: 'document_shared',
          document_id: id,
          recipient: client_email,
          share_token: shareToken,
          permission_type,
          message: `A document has been shared with you`
        });
      } catch (err) {
        console.error('Notification failed:', err);
      }
    }

    res.status(201).json({
      message: 'Document shared successfully',
      share: result.rows[0],
      shareUrl: `/client-portal/shared/${shareToken}`
    });
  } catch (err) {
    console.error('Share creation failed:', err);
    res.status(500).json({ error: 'Failed to create share', detail: err.message });
  }
});

// GET /api/documents/:id/shares - Get all shares for a document
router.get('/:id/shares', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT * FROM document_access_shares 
       WHERE document_id = $1 
       ORDER BY shared_at DESC`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching document shares:', err);
    res.status(500).json({ error: 'Failed to fetch shares', detail: err.message });
  }
});

// DELETE /api/documents/share/:shareId - Revoke a share link
router.delete('/share/:shareId', async (req, res) => {
  const { shareId } = req.params;
  const { revoked_by } = req.body;

  try {
    const result = await db.query(
      `UPDATE document_access_shares 
       SET is_active = FALSE
       WHERE share_id = $1
       RETURNING document_id, *`,
      [shareId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const share = result.rows[0];

    // Log activity
    await logDocumentActivity(share.document_id, 'share_revoked', revoked_by || 'system', {
      share_id: shareId
    });

    res.json({ message: 'Share revoked successfully' });
  } catch (err) {
    console.error('Share revocation failed:', err);
    res.status(500).json({ error: 'Failed to revoke share', detail: err.message });
  }
});

// GET /api/documents/search - Full-text search documents
router.get('/search/query', async (req, res) => {
  const { q, project_id, limit = 20, offset = 0 } = req.query;

  try {
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchTerm = q.trim();
    let baseQuery = `
      SELECT 
        d.document_id,
        d.name,
        d.project_id,
        d.project_name,
        d.description,
        d.document_type,
        d.size,
        d.created_at,
        d.unique_doc_id,
        d.status,
        dp.title as profile_title,
        dp.classification,
        (
          CASE 
            WHEN d.name ILIKE '%' || $1 || '%' THEN 3
            WHEN d.description ILIKE '%' || $1 || '%' THEN 2
            WHEN d.project_name ILIKE '%' || $1 || '%' THEN 1
            ELSE 0
          END
        ) as relevance
      FROM documents d
      LEFT JOIN document_profiles dp ON d.document_id = dp.document_id
      WHERE (d.name ILIKE '%' || $1 || '%' 
             OR d.description ILIKE '%' || $1 || '%'
             OR d.project_name ILIKE '%' || $1 || '%')
    `;

    const params = [searchTerm];
    let paramCount = 2;

    if (project_id) {
      baseQuery += ` AND d.project_id = $${paramCount}`;
      params.push(project_id);
      paramCount++;
    }

    baseQuery += ` ORDER BY relevance DESC, d.created_at DESC 
                   LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(baseQuery, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total FROM documents d
      WHERE (d.name ILIKE '%' || $1 || '%' 
             OR d.description ILIKE '%' || $1 || '%'
             OR d.project_name ILIKE '%' || $1 || '%')
    `;
    const countParams = [searchTerm];

    if (project_id) {
      countQuery += ` AND d.project_id = $2`;
      countParams.push(project_id);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total, 10);

    res.json({
      results: result.rows,
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Search failed:', err);
    res.status(500).json({ error: 'Search failed', detail: err.message });
  }
});

// GET /api/documents/:id/activity - Get activity log for a document
router.get('/:id/activity', async (req, res) => {
  const { id } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  try {
    const result = await db.query(
      `SELECT * FROM document_activity_log 
       WHERE document_id = $1
       ORDER BY performed_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching activity log:', err);
    res.status(500).json({ error: 'Failed to fetch activity', detail: err.message });
  }
});

// POST /api/documents/:id/categories - Assign document to category
router.post('/:id/assign-category', async (req, res) => {
  const { id } = req.params;
  const { category_id, assigned_by } = req.body;

  try {
    // Update document to link with category
    const result = await db.query(
      `UPDATE documents 
       SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{category_id}', $1)
       WHERE document_id = $2
       RETURNING *`,
      [JSON.stringify(category_id), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Log activity
    await logDocumentActivity(id, 'category_assigned', assigned_by || 'system', {
      category_id
    });

    res.json({ message: 'Category assigned successfully', document: result.rows[0] });
  } catch (err) {
    console.error('Category assignment failed:', err);
    res.status(500).json({ error: 'Failed to assign category', detail: err.message });
  }
});

// GET /api/documents/project/:projectId/by-category - Get documents organized by category
router.get('/project/:projectId/by-category', async (req, res) => {
  const { projectId } = req.params;

  try {
    // Get all categories for the project
    const categoriesResult = await db.query(
      `SELECT * FROM document_categories 
       WHERE project_id = $1 
       ORDER BY display_order ASC`,
      [projectId]
    );

    const categories = categoriesResult.rows;

    // For each category, get documents assigned to it
    const result = await Promise.all(
      categories.map(async (category) => {
        const docsResult = await db.query(
          `SELECT * FROM documents 
           WHERE project_id = $1 
           AND (metadata->>'category_id')::INTEGER = $2
           ORDER BY created_at DESC`,
          [projectId, category.category_id]
        );
        return {
          ...category,
          documents: docsResult.rows
        };
      })
    );

    // Also get uncategorized documents
    const uncategorizedResult = await db.query(
      `SELECT * FROM documents 
       WHERE project_id = $1 
       AND (metadata->>'category_id' IS NULL OR metadata->>'category_id' = '')
       ORDER BY created_at DESC`,
      [projectId]
    );

    result.push({
      category_id: null,
      category_name: 'Uncategorized',
      documents: uncategorizedResult.rows
    });

    res.json(result);
  } catch (err) {
    console.error('Error fetching categorized documents:', err);
    res.status(500).json({ error: 'Failed to fetch documents', detail: err.message });
  }
});

// POST /api/documents/categories - Create a new document category
router.post('/categories', async (req, res) => {
  const { project_id, category_name, description, icon, display_order } = req.body;

  try {
    if (!project_id || !category_name) {
      return res.status(400).json({ error: 'project_id and category_name are required' });
    }

    const result = await db.query(
      `INSERT INTO document_categories 
       (project_id, category_name, description, icon, display_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [project_id, category_name, description || null, icon || null, display_order || 0]
    );

    res.status(201).json({
      message: 'Category created successfully',
      category: result.rows[0]
    });
  } catch (err) {
    console.error('Category creation failed:', err);
    res.status(500).json({ error: 'Failed to create category', detail: err.message });
  }
});

// GET /api/documents/categories/:projectId - Get all categories for a project
router.get('/categories/:projectId', async (req, res) => {
  const { projectId } = req.params;

  try {
    const result = await db.query(
      `SELECT * FROM document_categories 
       WHERE project_id = $1 
       ORDER BY display_order ASC`,
      [projectId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories', detail: err.message });
  }
});

// GET /api/documents/:id/accessible-shares - Check if document is accessible via share token
router.get('/shared/:shareToken/validate', async (req, res) => {
  const { shareToken } = req.params;

  try {
    const result = await db.query(
      `SELECT das.*, d.document_id, d.name, d.mime_type, d.size, d.project_name
       FROM document_access_shares das
       JOIN documents d ON das.document_id = d.document_id
       WHERE das.share_token = $1 AND das.is_active = TRUE
       AND (das.expires_at IS NULL OR das.expires_at > CURRENT_TIMESTAMP)`,
      [shareToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired share link' });
    }

    const share = result.rows[0];

    // Update access count and last accessed
    await db.query(
      `UPDATE document_access_shares 
       SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
       WHERE share_id = $1`,
      [share.share_id]
    );

    // Log activity
    await logDocumentActivity(share.document_id, 'accessed_via_share', 'external_user', {
      share_token: shareToken
    });

    res.json({
      isValid: true,
      document_id: share.document_id,
      document_name: share.name,
      mime_type: share.mime_type,
      size: share.size,
      project_name: share.project_name,
      permission_type: share.permission_type
    });
  } catch (err) {
    console.error('Share validation failed:', err);
    res.status(500).json({ error: 'Validation failed', detail: err.message });
  }
});

// GET /api/documents/shared/:shareToken/download - Download document via share link
router.get('/shared/:shareToken/download', async (req, res) => {
  const { shareToken } = req.params;

  try {
    const result = await db.query(
      `SELECT das.*, d.document_id, d.name, d.mime_type, d.content
       FROM document_access_shares das
       JOIN documents d ON das.document_id = d.document_id
       WHERE das.share_token = $1 AND das.is_active = TRUE
       AND (das.expires_at IS NULL OR das.expires_at > CURRENT_TIMESTAMP)`,
      [shareToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired share link' });
    }

    const share = result.rows[0];

    if (share.permission_type !== 'download' && share.permission_type !== 'edit') {
      return res.status(403).json({ error: 'Download not permitted for this share' });
    }

    // Update access info
    await db.query(
      `UPDATE document_access_shares 
       SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
       WHERE share_id = $1`,
      [share.share_id]
    );

    // Log activity
    await logDocumentActivity(share.document_id, 'downloaded_via_share', 'external_user', {
      share_token: shareToken
    });

    res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${share.name.replace(/\"/g, '')}"`);
    res.send(share.content);
  } catch (err) {
    console.error('Share download failed:', err);
    res.status(500).json({ error: 'Download failed', detail: err.message });
  }
});

module.exports = router;
