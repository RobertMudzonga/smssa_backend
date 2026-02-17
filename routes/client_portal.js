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

// Helper function to hash password
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

// Helper function to generate random password
function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoiding confusing characters like 0/O, 1/I
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// POST /api/client-portal/generate - Create client portal access with password
router.post('/generate', async (req, res) => {
  try {
    const { project_id, expiry_days = 90 } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    // Check project exists
    const projectRes = await db.query(
      'SELECT project_id, project_name, client_name FROM projects WHERE project_id = $1 LIMIT 1',
      [project_id]
    );
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const project = projectRes.rows[0];

    // Generate unique token and password
    const token = `portal-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
    const password = generatePassword(8);
    const salt = crypto.randomBytes(16).toString('hex');
    const password_hash = hashPassword(password, salt);

    // Calculate expiry date
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + expiry_days);

    // Deactivate any existing access for this project
    await db.query(
      'UPDATE client_portal_access SET is_active = false WHERE project_id = $1',
      [project_id]
    );

    // Insert new access record
    const result = await db.query(
      `INSERT INTO client_portal_access (project_id, access_token, password_hash, expires_at, is_active, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       RETURNING id, access_token, expires_at`,
      [project_id, token, salt + ':' + password_hash, expires_at]
    );

    // Generate the portal URL
    const base = process.env.CLIENT_PORTAL_BASE || process.env.FRONTEND_URL || 'http://localhost:5173';
    const portalUrl = `${base.replace(/\/$/, '')}/client-portal?token=${encodeURIComponent(token)}`;

    res.json({
      ok: true,
      portalUrl,
      password, // Only returned once at generation time
      expires_at,
      project_name: project.project_name,
      client_name: project.client_name
    });
  } catch (err) {
    console.error('Generate client portal access error:', err);
    res.status(500).json({ error: 'Failed to generate client portal access' });
  }
});

// POST /api/client-portal/login - Authenticate with password
router.post('/login', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    // Find access record
    const accessRes = await db.query(
      'SELECT * FROM client_portal_access WHERE access_token = $1 AND is_active = true LIMIT 1',
      [token]
    );
    if (accessRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid access link' });
    }

    const access = accessRes.rows[0];

    // Check if expired
    if (new Date(access.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Access link has expired. Please contact your consultant.' });
    }

    // Verify password
    const [salt, storedHash] = (access.password_hash || '').split(':');
    if (!salt || !storedHash) {
      return res.status(401).json({ error: 'Invalid access configuration' });
    }

    const providedHash = hashPassword(password, salt);
    if (providedHash !== storedHash) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Update last accessed
    await db.query(
      'UPDATE client_portal_access SET last_accessed_at = NOW() WHERE id = $1',
      [access.id]
    );

    // Check if this is for a project or legal case
    const isLegalCase = !access.project_id && access.legal_case_id;
    let entityData = null;
    
    if (isLegalCase) {
      // Get legal case details
      const caseRes = await db.query(
        'SELECT * FROM legal_cases WHERE case_id = $1 LIMIT 1',
        [access.legal_case_id]
      );
      entityData = caseRes.rows?.[0] || null;
    } else {
      // Get project details
      const projectRes = await db.query(
        'SELECT * FROM projects WHERE project_id = $1 LIMIT 1',
        [access.project_id]
      );
      entityData = projectRes.rows?.[0] || null;
    }

    // Generate a session token for subsequent requests
    const sessionToken = crypto.randomBytes(32).toString('hex');

    res.json({
      ok: true,
      authenticated: true,
      sessionToken,
      isLegalCase,
      project: entityData, // Keep 'project' for backward compatibility
      legalCase: isLegalCase ? entityData : null,
      access_id: access.id
    });
  } catch (err) {
    console.error('Client portal login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/client-portal/validate?token=...
// Returns whether password is required and basic project/case info
router.get('/validate', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'missing_token' });
  try {
    const q = await db.query('SELECT * FROM client_portal_access WHERE access_token=$1 AND is_active = true LIMIT 1', [token]);
    const access = q.rows?.[0] || null;
    if (!access) return res.status(404).json({ error: 'invalid_or_expired' });
    if (new Date(access.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });
    
    // Check if password is set
    const requiresPassword = !!(access.password_hash && access.password_hash.includes(':'));
    
    // Check if this is for a project or legal case
    const isLegalCase = !access.project_id && access.legal_case_id;
    
    let entityInfo = null;
    if (isLegalCase) {
      // Load legal case info
      const c = await db.query('SELECT case_id, case_reference, case_title, client_name FROM legal_cases WHERE case_id=$1 LIMIT 1', [access.legal_case_id]);
      const legalCase = c.rows?.[0] || null;
      if (legalCase) {
        entityInfo = {
          type: 'legal_case',
          case_id: legalCase.case_id,
          case_reference: legalCase.case_reference,
          case_title: legalCase.case_title,
          client_name: legalCase.client_name
        };
      }
    } else {
      // Load project info
      const p = await db.query('SELECT project_id, project_name, client_name FROM projects WHERE project_id=$1 LIMIT 1', [access.project_id]);
      const project = p.rows?.[0] || null;
      if (project) {
        entityInfo = {
          type: 'project',
          project_id: project.project_id,
          project_name: project.project_name,
          client_name: project.client_name
        };
      }
    }
    
    return res.json({ 
      ok: true, 
      requiresPassword,
      isLegalCase,
      project: entityInfo, // Keep 'project' for backward compatibility
      token 
    });
  } catch (err) {
    console.error('Client portal validate error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// GET /api/client-portal/progress?token=... - Get project/legal case progress and stages
router.get('/progress', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'Token required' });

    // Validate token
    const accessRes = await db.query(
      'SELECT * FROM client_portal_access WHERE access_token = $1 AND is_active = true LIMIT 1',
      [token]
    );
    if (accessRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid access' });
    }
    const access = accessRes.rows[0];
    if (new Date(access.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Access expired' });
    }

    // Check if this is for a project or legal case
    const isLegalCase = !access.project_id && access.legal_case_id;
    
    if (isLegalCase) {
      // Handle legal case progress
      const caseRes = await db.query(
        `SELECT case_id, case_reference, case_title, case_type, case_status,
                client_name, current_step, current_step_name, step_history,
                created_at, started_at, next_deadline
         FROM legal_cases WHERE case_id = $1`,
        [access.legal_case_id]
      );
      const legalCase = caseRes.rows[0] || null;
      if (!legalCase) {
        return res.status(404).json({ error: 'Legal case not found' });
      }

      // Parse step_history (could be JSON string or object)
      let stepHistory = [];
      try {
        stepHistory = typeof legalCase.step_history === 'string' 
          ? JSON.parse(legalCase.step_history) 
          : (legalCase.step_history || []);
      } catch (e) {
        stepHistory = [];
      }

      // Build stages from step_history
      const stages = stepHistory.map((step, idx) => ({
        number: idx + 1,
        name: step.step_name,
        description: step.notes || '',
        completed: step.status === 'completed',
        status: step.status
      }));

      const completedSteps = stepHistory.filter(s => s.status === 'completed').length;
      const totalSteps = stepHistory.length || 1;
      const progress = Math.round((completedSteps / totalSteps) * 100);

      // Get documents count for this legal case
      let checklistTotal = 0;
      let checklistReceived = 0;
      try {
        const docsRes = await db.query(
          'SELECT COUNT(*) as total FROM documents WHERE legal_case_id = $1',
          [access.legal_case_id]
        );
        checklistReceived = Number(docsRes.rows[0]?.total || 0);
      } catch (e) {}

      res.json({
        ok: true,
        isLegalCase: true,
        project: {
          case_id: legalCase.case_id,
          case_reference: legalCase.case_reference,
          project_name: legalCase.case_title, // For UI compatibility
          client_name: legalCase.client_name,
          status: legalCase.case_status,
          visa_type: legalCase.case_type,
          start_date: legalCase.started_at,
          progress
        },
        currentStage: legalCase.current_step,
        stages,
        checklist: {
          total: checklistTotal,
          received: checklistReceived
        }
      });
    } else {
      // Handle regular project progress
      const projectRes = await db.query(
        `SELECT project_id, project_name, client_name, status, 
                current_stage, stage, progress, visa_type, case_type,
                submission_status, start_date, created_at
         FROM projects WHERE project_id = $1`,
        [access.project_id]
      );
      const project = projectRes.rows[0] || null;
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Calculate stage information
      const stageNum = Number(project.current_stage ?? project.stage ?? 1);
      const stages = [
        { number: 1, name: 'New Client', description: 'Initial consultation and introduction', completed: stageNum > 1 },
        { number: 2, name: 'Document Preparation', description: 'Collecting required documents', completed: stageNum > 2 },
        { number: 3, name: 'Review & Submission', description: 'Documents reviewed and submitted', completed: stageNum > 3 },
        { number: 4, name: 'Processing', description: 'Application being processed', completed: stageNum > 4 },
        { number: 5, name: 'Tracking', description: 'Tracking application status', completed: stageNum > 5 },
        { number: 6, name: 'Completed', description: 'Application finalized', completed: stageNum >= 6 }
      ];

      // Get checklist progress
      const checklistRes = await db.query(
        `SELECT COUNT(*) as total, 
                SUM(CASE WHEN is_received = true THEN 1 ELSE 0 END) as received
         FROM document_checklists WHERE project_id = $1`,
        [access.project_id]
      );
      const checklist = checklistRes.rows[0] || { total: 0, received: 0 };

      const progress = project.progress || Math.round(((stageNum - 1) / 5) * 100);

      res.json({
        ok: true,
        isLegalCase: false,
        project: {
          project_id: project.project_id,
          project_name: project.project_name,
          client_name: project.client_name,
          status: project.status,
          visa_type: project.visa_type || project.case_type,
          submission_status: project.submission_status,
          start_date: project.start_date,
          progress
        },
        currentStage: stageNum,
        stages,
        checklist: {
          total: Number(checklist.total) || 0,
          received: Number(checklist.received) || 0
        }
      });
    }
  } catch (err) {
    console.error('Client portal progress error:', err);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

// GET /api/client-portal/documents?token=... - Get list of documents (no content)
router.get('/documents', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'Token required' });

    // Validate token
    const accessRes = await db.query(
      'SELECT * FROM client_portal_access WHERE access_token = $1 AND is_active = true LIMIT 1',
      [token]
    );
    if (accessRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid access' });
    }
    const access = accessRes.rows[0];
    if (new Date(access.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Access expired' });
    }

    // Check if this is for a project or legal case
    const isLegalCase = !access.project_id && access.legal_case_id;
    
    let docsRes;
    if (isLegalCase) {
      // Get documents for legal case
      docsRes = await db.query(
        `SELECT document_id, name, document_type, description, mime_type, size, 
                created_at, uploaded_by, status
         FROM documents WHERE legal_case_id = $1
         ORDER BY created_at DESC`,
        [access.legal_case_id]
      );
    } else {
      // Get documents for project
      docsRes = await db.query(
        `SELECT document_id, name, document_type, description, mime_type, size, 
                created_at, uploaded_by, status
         FROM documents WHERE project_id = $1
         ORDER BY created_at DESC`,
        [access.project_id]
      );
    }

    res.json({
      ok: true,
      documents: docsRes.rows
    });
  } catch (err) {
    console.error('Client portal documents error:', err);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// GET /api/client-portal/document/:documentId/view?token=... - View document securely
router.get('/document/:documentId/view', async (req, res) => {
  try {
    const { documentId } = req.params;
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'Token required' });

    // Validate token
    const accessRes = await db.query(
      'SELECT * FROM client_portal_access WHERE access_token = $1 AND is_active = true LIMIT 1',
      [token]
    );
    if (accessRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid access' });
    }
    const access = accessRes.rows[0];
    if (new Date(access.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Access expired' });
    }

    // Check if this is for a project or legal case
    const isLegalCase = !access.project_id && access.legal_case_id;
    
    let docRes;
    if (isLegalCase) {
      // Get document ensuring it belongs to the legal case
      docRes = await db.query(
        `SELECT document_id, name, mime_type, content
         FROM documents WHERE document_id = $1 AND legal_case_id = $2`,
        [documentId, access.legal_case_id]
      );
    } else {
      // Get document ensuring it belongs to the project
      docRes = await db.query(
        `SELECT document_id, name, mime_type, content
         FROM documents WHERE document_id = $1 AND project_id = $2`,
        [documentId, access.project_id]
      );
    }

    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docRes.rows[0];

    // Add headers to prevent caching and downloading
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline'); // View only, not download
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Send file content
    if (doc.content) {
      res.send(doc.content);
    } else {
      res.status(404).json({ error: 'Document content not available' });
    }
  } catch (err) {
    console.error('Client portal document view error:', err);
    res.status(500).json({ error: 'Failed to load document' });
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

    // Check if this is for a project or legal case
    const isLegalCase = !access.project_id && access.legal_case_id;
    
    let entityId, entityName, entityType;
    
    if (isLegalCase) {
      // Get legal case information
      const caseRes = await db.query(
        'SELECT case_id, case_name FROM legal_cases WHERE case_id = $1 LIMIT 1',
        [access.legal_case_id]
      );

      if (caseRes.rows.length === 0) {
        return res.status(404).json({ error: 'Associated legal case not found' });
      }

      entityId = caseRes.rows[0].case_id;
      entityName = caseRes.rows[0].case_name;
      entityType = 'legal_case';
    } else {
      // Get project information
      const projectRes = await db.query(
        'SELECT project_id, project_name FROM projects WHERE project_id = $1 LIMIT 1',
        [access.project_id]
      );

      if (projectRes.rows.length === 0) {
        return res.status(404).json({ error: 'Associated project not found' });
      }

      entityId = projectRes.rows[0].project_id;
      entityName = projectRes.rows[0].project_name;
      entityType = 'project';
    }

    const { document_type = null, description = null } = req.body;
    const file = req.file;

    // Calculate file hash for deduplication
    const fileHash = calculateFileHash(file.buffer);

    // Check for duplicate file
    let duplicateCheck;
    if (isLegalCase) {
      duplicateCheck = await db.query(
        'SELECT document_id, name FROM documents WHERE legal_case_id = $1 AND file_hash = $2 LIMIT 1',
        [entityId, fileHash]
      );
    } else {
      duplicateCheck = await db.query(
        'SELECT document_id, name FROM documents WHERE project_id = $1 AND file_hash = $2 LIMIT 1',
        [entityId, fileHash]
      );
    }
    
    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Duplicate file', 
        detail: `This file has already been uploaded: ${duplicateCheck.rows[0].name}`,
        existing_document_id: duplicateCheck.rows[0].document_id
      });
    }

    // Insert document record
    let result;
    if (isLegalCase) {
      result = await db.query(
        `INSERT INTO documents (legal_case_id, name, mime_type, size, content, document_type, description, uploaded_by, file_hash, expiry_date) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [entityId, file.originalname, file.mimetype, file.size, file.buffer, document_type, description, 'client_portal', fileHash, expiry_date]
      );
    } else {
      result = await db.query(
        `INSERT INTO documents (project_id, project_name, name, mime_type, size, content, document_type, description, uploaded_by, file_hash, expiry_date) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [entityId, entityName, file.originalname, file.mimetype, file.size, file.buffer, document_type, description, 'client_portal', fileHash, expiry_date]
      );
    }

    const document = result.rows[0];

    // Update last_accessed_at
    await db.query('UPDATE client_portal_access SET last_accessed_at = NOW() WHERE id = $1', [access.id]).catch(() => {});

    // Send notification
    try {
      await sendNotification({
        type: 'document_uploaded',
        project_id: isLegalCase ? null : entityId,
        legal_case_id: isLegalCase ? entityId : null,
        project_name: entityName,
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
      project_name: entityName,
      entity_type: entityType
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
