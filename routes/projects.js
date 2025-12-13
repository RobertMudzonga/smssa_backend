const express = require('express');
const router = express.Router();
const db = require('../db');

// --- 1. CREATE PROJECT (Converts Lead to Project with Auto-Checklist) ---
// This is called when a lead in Stage 13 ('Won') is converted.
router.post('/', async (req, res) => {
    const { client_lead_id, visa_type_id, assigned_user_id } = req.body;
    
    // Start transaction
    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');

        // A. Create the Project Entry (Starts at Stage 1 of the 6-stage Production Pipeline)
        const projectRes = await client.query(
            `INSERT INTO projects (client_lead_id, visa_type_id, assigned_user_id, current_stage) 
             VALUES ($1, $2, $3, 1) 
             RETURNING project_id`,
            [client_lead_id, visa_type_id, assigned_user_id]
        );
        const projectId = projectRes.rows[0].project_id;

        // B. Fetch the Template Requirements for this Visa Type
        const templateRes = await client.query(
            `SELECT document_id FROM visa_document_checklist WHERE visa_type_id = $1`,
            [visa_type_id]
        );

        // C. Bulk Insert these requirements into project_documents (Client's specific checklist)
        for (let row of templateRes.rows) {
            await client.query(
                `INSERT INTO project_documents (project_id, document_id, status) VALUES ($1, $2, 'Pending')`,
                [projectId, row.document_id]
            );
        }

                // D. Create a document folder for this project (use lead/company name where possible)
                try {
                    // Determine folder name: prefer name from request body, then company from lead, else fallback
                    let folderName = req.body.project_name || null;
                    if (!folderName && client_lead_id) {
                        const leadRes = await client.query('SELECT company, first_name, last_name FROM leads WHERE lead_id = $1', [client_lead_id]);
                        if (leadRes.rows.length > 0) {
                            const lead = leadRes.rows[0];
                            folderName = lead.company || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || null;
                        }
                    }
                    if (!folderName) folderName = `project-${projectId}`;

                    await client.query('INSERT INTO document_folders (project_id, name) VALUES ($1, $2)', [projectId, folderName]);
                } catch (folderErr) {
                    console.error('Error creating document folder during project creation:', folderErr);
                    // non-fatal; continue
                }

                // D. Optionally, set the Lead status to 'Converted' or similar in the leads table (Not strictly required as stage 13 means 'Won')
                await client.query('COMMIT');
                res.status(201).json({ message: "Project created and checklist generated", projectId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Project Creation Error:", err);
        res.status(500).json({ error: "Failed to create project" });
    } finally {
        client.release();
    }
});

// --- 2. GET PROJECT DETAILS ---
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const project = await db.query(`
            SELECT p.*, 
                   l.first_name, l.last_name, l.company, l.email,
                   v.name as visa_type_name
            FROM projects p
            JOIN leads l ON p.client_lead_id = l.lead_id
            JOIN visa_types v ON p.visa_type_id = v.visa_type_id
            WHERE p.project_id = $1
        `, [id]);

        if (project.rows.length === 0) return res.status(404).json({ error: "Project not found" });

        const documents = await db.query(`
            SELECT pd.project_document_id, pd.project_id, pd.status, pd.notes, pd.date_received,
                   d.name as document_name, d.description
            FROM project_documents pd
            JOIN documents d ON pd.document_id = d.document_id
            WHERE pd.project_id = $1
            ORDER BY d.name ASC
        `, [id]);

        res.json({
            project: project.rows[0],
            documents: documents.rows
        });

    } catch (err) {
        console.error("Error fetching project details:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// GET project by lead id (helpful to find project created for a client/lead)
router.get('/by-lead/:leadId', async (req, res) => {
    try {
        const { leadId } = req.params;
        const result = await db.query('SELECT * FROM projects WHERE client_lead_id = $1 ORDER BY created_at DESC LIMIT 1', [leadId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found for lead' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching project by lead id:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/projects - list projects (brief)
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.project_id, p.client_lead_id, p.visa_type_id, p.assigned_user_id, p.current_stage, p.created_at,
                   l.first_name, l.last_name, l.company
            FROM projects p
            LEFT JOIN leads l ON p.client_lead_id = l.lead_id
            ORDER BY p.created_at DESC
            LIMIT 200
        `);
        // map to small shape
        const rows = result.rows.map(r => ({
            project_id: r.project_id,
            client_lead_id: r.client_lead_id,
            name: r.company || `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Project ${r.project_id}`
        }));
        res.json(rows);
    } catch (err) {
        console.error('Error listing projects:', err);
        res.status(500).json({ error: 'Server error listing projects' });
    }
});

// --- 3. UPDATE STAGE / TRACKING DATA ---
// Handles stage transitions (1->2, 2->3, etc.) and task updates within stages.
router.patch('/:id/stage', async (req, res) => {
    const { id } = req.params;
    const updates = req.body; 
    
    const allowedFields = [
        'current_stage', 'task_introduction_done', 'task_supervisor_reviewed', 
        'submission_status', 'tracking_submission_type', 'tracking_submission_center',
        'tracking_date', 'tracking_visa_ref', 'tracking_vfs_receipt', 'tracking_receipt_number', 
        'final_outcome'
    ];

    let queryParts = [];
    let values = [];
    let counter = 1;

    for (let key in updates) {
        if (allowedFields.includes(key)) {
            queryParts.push(`${key} = $${counter}`);
            values.push(updates[key]);
            counter++;
        }
    }

    if (queryParts.length === 0) return res.status(400).json({ error: "No valid fields to update" });

    values.push(id); 
    const query = `UPDATE projects SET ${queryParts.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE project_id = $${counter} RETURNING *`;

    try {
        const result = await db.query(query, values);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Project update failed:", err);
        res.status(500).json({ error: "Update failed" });
    }
});

// --- 4. TOGGLE DOCUMENT STATUS ---
// Updates document checklist status for a specific project.
router.patch('/documents/:docId', async (req, res) => {
    const { docId } = req.params;
    const { status } = req.body; // 'Pending', 'Received', or 'Verified'

    try {
        const result = await db.query(
            `UPDATE project_documents 
             SET status = $1, date_received = CASE WHEN $1 = 'Received' THEN CURRENT_DATE ELSE NULL END 
             WHERE project_document_id = $2 RETURNING *`,
            [status, docId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Document update failed:", err);
        res.status(500).json({ error: "Document update failed" });
    }
});

module.exports = router;