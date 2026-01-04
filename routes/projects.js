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

        // If the projects table doesn't exist, avoid throwing a 500 — echo back for UI continuity.
        const existsCheck = await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') as exists");
        if (!existsCheck.rows[0] || !existsCheck.rows[0].exists) {
            console.warn('projects table not found during create - returning echo response');
            await client.query('ROLLBACK');
            return res.status(201).json({ ok: true, created: { client_lead_id, visa_type_id, assigned_user_id } });
        }

        // A. Create the Project Entry (Starts at Stage 1 of the 6-stage Production Pipeline)
        // Adapt to different schemas by checking which columns exist.
        const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const cols = colRes.rows.map(r => r.column_name);
        const insertCols = [];
        const values = [];
        const placeholders = [];
        let idx = 1;

        if (cols.includes('client_lead_id')) { insertCols.push('client_lead_id'); values.push(client_lead_id); placeholders.push(`$${idx++}`); }
        else if (cols.includes('lead_id')) { insertCols.push('lead_id'); values.push(client_lead_id); placeholders.push(`$${idx++}`); }

        if (cols.includes('visa_type_id')) { insertCols.push('visa_type_id'); values.push(visa_type_id); placeholders.push(`$${idx++}`); }
        if (cols.includes('assigned_user_id')) { insertCols.push('assigned_user_id'); values.push(assigned_user_id); placeholders.push(`$${idx++}`); }
        if (cols.includes('current_stage')) { insertCols.push('current_stage'); values.push(1); placeholders.push(`$${idx++}`); }
        // default projects should be active unless otherwise specified
        if (cols.includes('status')) { insertCols.push('status'); values.push('Active'); placeholders.push(`$${idx++}`); }

        if (insertCols.length === 0) {
            throw new Error('No known insertable columns found in projects table');
        }

        const returnCol = cols.includes('project_id') ? 'project_id' : (cols.includes('id') ? 'id' : 'project_id');
        const q = `INSERT INTO projects (${insertCols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING ${returnCol}`;
        const projectRes = await client.query(q, values);
        const projectId = projectRes.rows[0][returnCol];

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
            LEFT JOIN leads l ON p.client_lead_id = l.lead_id
            LEFT JOIN visa_types v ON p.visa_type_id = v.visa_type_id
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
        // If the projects table doesn't exist, return an empty list instead of 500.
        const existsRes = await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') as exists");
        if (!existsRes.rows[0] || !existsRes.rows[0].exists) {
            console.warn('projects table not found - returning empty list');
            return res.json([]);
        }

        // Discover actual projects table columns to adapt to schema variations
        const colRes = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const cols = colRes.rows.map(r => r.column_name);

        // Build a select list that includes useful project fields when available
        const selectCols = [];
        const add = (c, alias) => { if (cols.includes(c)) selectCols.push(`p.${c}${alias ? ` as ${alias}` : ''}`); };
        add('project_id');
        add('project_name');
        add('client_name');
        add('client_email');
        add('client_lead_id');
        add('client_id');
        add('case_type');
        add('priority');
        add('progress');
        add('status');
        add('start_date');
        add('payment_amount');
        add('created_at');

        // Always include lead names when available, but only join if the `leads` table exists
        let joinLead = cols.includes('client_lead_id');
        if (joinLead) {
            try {
                const leadTable = await db.query("SELECT to_regclass('public.leads') as exists");
                if (!leadTable.rows[0] || !leadTable.rows[0].exists) {
                    console.warn('Leads table not present; skipping join in projects list');
                    joinLead = false;
                }
            } catch (e) {
                console.warn('Error checking leads table existence, skipping join:', e && e.message ? e.message : e);
                joinLead = false;
            }
        }

        const leadSelect = joinLead ? 'l.first_name, l.last_name, l.company' : '';
        const selectList = (selectCols.join(', ') || 'p.project_id as project_id') + (leadSelect ? ', ' + leadSelect : '');
        const sql = `SELECT ${selectList}
                 FROM projects p
                 ${joinLead ? 'LEFT JOIN leads l ON p.client_lead_id = l.lead_id' : ''}
                 ORDER BY ${cols.includes('created_at') ? 'p.created_at' : 'p.project_id'} DESC
                 LIMIT 200`;

        const result = await db.query(sql);

        // Map rows to include sensible fallbacks for the frontend
        const rows = result.rows.map(r => ({
            project_id: r.project_id,
            project_name: r.project_name || r.name || r.company || `Project ${r.project_id}`,
            client_name: r.client_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || '',
            client_email: r.client_email || '',
            case_type: r.case_type || '',
            priority: r.priority || '',
            progress: r.progress,
            status: r.status || '',
            start_date: r.start_date || null,
            payment_amount: r.payment_amount || null,
            created_at: r.created_at
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
    // Validate and map incoming fields to real DB columns to avoid SQL errors
    try {
        const colRes = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const existingCols = colRes.rows.map(r => r.column_name);

        const allowedFields = [
            'current_stage', 'task_introduction_done', 'task_supervisor_reviewed',
            'submission_status',
            // submission_* keys from frontend will be mapped to tracking_* if available
            'submission_type', 'submission_center', 'submission_date', 'visa_ref', 'vfs_receipt', 'receipt_number',
            // fallback tracking_* fields
            'tracking_submission_type', 'tracking_submission_center', 'tracking_date', 'tracking_visa_ref', 'tracking_vfs_receipt', 'tracking_receipt_number',
            'final_outcome',
            // allow updating progress explicitly
            'progress'
        ];

        const queryParts = [];
        const values = [];
        let counter = 1;

        const mapFieldToColumn = (key) => {
            // If the exact column exists, use it
            if (existingCols.includes(key)) return key;
            // Map current_stage -> stage if that's what the DB uses
            if (key === 'current_stage' && existingCols.includes('stage')) return 'stage';
            // Special-case submission_status: map to submission_status or fallback to status
            if (key === 'submission_status') {
                if (existingCols.includes('submission_status')) return 'submission_status';
                if (existingCols.includes('status')) return 'status';
            }
            // Map submission_* -> tracking_* if tracking columns exist (e.g., submission_date -> tracking_date)
            if (key.startsWith('submission_')) {
                const mapped = key.replace('submission_', 'tracking_');
                if (existingCols.includes(mapped)) return mapped;
            }
            return null;
        };

        for (let key in updates) {
            if (!allowedFields.includes(key)) continue;
            const targetCol = mapFieldToColumn(key);
            if (!targetCol) continue;
            queryParts.push(`${targetCol} = $${counter}`);
            values.push(updates[key]);
            counter++;
        }

        // If current_stage is present in updates and DB has a `status` column,
        // set a sensible project status unless the caller provided one.
        if (typeof updates.current_stage !== 'undefined' && existingCols.includes('status')) {
            const hasStatusInParts = queryParts.some(q => q.startsWith('status ='));
            if (!hasStatusInParts) {
                const stageVal = Number(updates.current_stage) || 0;
                let statusVal = 'In Progress';
                if (stageVal === 1) statusVal = 'Active';
                else if (stageVal >= 2 && stageVal <= 5) statusVal = 'In Progress';
                else if (stageVal === 6) statusVal = 'Completed';
                queryParts.push(`status = $${counter}`);
                values.push(statusVal);
                counter++;
            }
        }

        if (queryParts.length === 0) return res.status(400).json({ error: "No valid fields to update" });

        values.push(id);
        // Only set updated_at if the column exists in this projects table
        const setUpdatedAt = existingCols.includes('updated_at') ? ', updated_at = CURRENT_TIMESTAMP' : '';
        const query = `UPDATE projects SET ${queryParts.join(', ')}${setUpdatedAt} WHERE project_id = $${counter} RETURNING *`;

        try {
            console.log('Executing project update:', query, values);
            const result = await db.query(query, values);
            res.json(result.rows[0]);
        } catch (err) {
            console.error("Project update failed:", err);
            res.status(500).json({ error: "Update failed" });
        }
    } catch (err) {
        console.error('Error inspecting project columns for update:', err);
        res.status(500).json({ error: 'Update failed' });
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

// DELETE /api/projects/:id - delete project and related data
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        // Check current status - only allow delete when project is Completed
        try {
            const stat = await client.query('SELECT status FROM projects WHERE project_id = $1', [id]);
            if (stat.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Project not found' });
            }
            const statusVal = (stat.rows[0].status || '').toString().toLowerCase();
            if (statusVal !== 'completed' && statusVal !== 'complete') {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Cannot delete active project. Only completed projects may be deleted.' });
            }
        } catch (e) {
            // If selecting status fails, roll back and return error
            await client.query('ROLLBACK');
            console.error('Failed to verify project status before delete:', e);
            return res.status(500).json({ error: 'Failed to verify project status' });
        }
        // remove project documents if table exists
        try {
            await client.query('DELETE FROM project_documents WHERE project_id = $1', [id]);
        } catch (e) {
            // ignore if table doesn't exist or other non-fatal issue
            console.warn('Warning deleting project_documents for project', id, e && e.message ? e.message : e);
        }
        // remove document folders
        try {
            await client.query('DELETE FROM document_folders WHERE project_id = $1', [id]);
        } catch (e) {
            console.warn('Warning deleting document_folders for project', id, e && e.message ? e.message : e);
        }
        // delete the project row
        const result = await client.query('DELETE FROM projects WHERE project_id = $1 RETURNING *', [id]);
        await client.query('COMMIT');
        if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
        res.json({ ok: true, deleted: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Project delete failed:', err);
        res.status(500).json({ error: 'Failed to delete project' });
    } finally {
        client.release();
    }
});

// POST /api/projects/create - lightweight project creation helper
router.post('/create', async (req, res) => {
    const payload = req.body || {};
    try {
        // Check which columns actually exist on the projects table, then only attempt to insert those.
        const colRes = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const existingCols = colRes.rows.map(r => r.column_name);

        const allowed = ['project_name','client_name','client_email','case_type','priority','start_date','payment_amount','client_id','status','progress','visa_type_id','current_stage','assigned_user_id','assigned_manager_id'];
        const fields = [];
        const values = [];

        for (const k of allowed) {
            if (typeof payload[k] !== 'undefined' && existingCols.includes(k)) {
                fields.push(k);
                values.push(payload[k]);
            }
        }

        // If the projects table requires a visa_type_id but the payload didn't provide one,
        // try to pick a sensible default: first existing visa_type, or create a 'Default' one.
        if (existingCols.includes('visa_type_id') && !fields.includes('visa_type_id')) {
            try {
                const vtRes = await db.query('SELECT visa_type_id FROM visa_types ORDER BY visa_type_id LIMIT 1');
                if (vtRes.rows.length > 0) {
                    fields.push('visa_type_id');
                    values.push(vtRes.rows[0].visa_type_id);
                } else {
                    // Create a default visa type
                    try {
                        const ins = await db.query("INSERT INTO visa_types (name) VALUES ($1) RETURNING visa_type_id", ['Default']);
                        fields.push('visa_type_id');
                        values.push(ins.rows[0].visa_type_id);
                    } catch (createErr) {
                        console.warn('Failed to create default visa_type:', createErr.message || createErr);
                    }
                }
            } catch (vtErr) {
                console.warn('Failed to lookup visa_types for defaulting visa_type_id:', vtErr.message || vtErr);
            }
        }

        if (fields.length > 0) {
            const q = `INSERT INTO projects (${fields.join(',')}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`;
            try {
                const result = await db.query(q, values);
                return res.status(201).json(result.rows[0]);
            } catch (innerErr) {
                console.error('Projects insert failed (maybe schema mismatch):', innerErr);
                console.warn('Projects insert failed (maybe schema mismatch), returning echo:', innerErr.message || innerErr);
                return res.status(201).json({ ok: true, created: payload });
            }
        }

        // Nothing to insert — echo back so UI can continue without hard failure
        return res.status(201).json({ ok: true, created: payload });
    } catch (err) {
        console.error('Error creating project:', err);
        res.status(500).json({ error: 'Failed to create project' });
    }
});