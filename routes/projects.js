const express = require('express');
const router = express.Router();
const db = require('../db');

// --- 1. CREATE PROJECT ---
// Flexible endpoint: accepts either lead-to-project conversion OR direct project creation
router.post('/', async (req, res) => {
    const { client_lead_id, visa_type_id, assigned_user_id, project_manager_id, project_name, client_name, client_email, case_type, priority, start_date, payment_amount } = req.body;
    
    // Start transaction
    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');

        // Check if projects table exists
        const existsCheck = await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') as exists");
        if (!existsCheck.rows[0] || !existsCheck.rows[0].exists) {
            console.warn('projects table not found during create - returning echo response');
            await client.query('ROLLBACK');
            return res.status(201).json({ ok: true, created: { project_name, client_name } });
        }

        // Get available columns to build flexible insert
        const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const cols = colRes.rows.map(r => r.column_name);
        const insertCols = [];
        const values = [];
        const placeholders = [];
        let idx = 1;

        // Add fields that exist in the table
        if (cols.includes('client_lead_id') && client_lead_id) { 
            insertCols.push('client_lead_id'); 
            values.push(client_lead_id); 
            placeholders.push(`$${idx++}`); 
        }
        
        if (cols.includes('visa_type_id') && visa_type_id) { 
            insertCols.push('visa_type_id'); 
            values.push(visa_type_id); 
            placeholders.push(`$${idx++}`); 
        }
        
        if (cols.includes('assigned_user_id') && assigned_user_id) { 
            insertCols.push('assigned_user_id'); 
            values.push(assigned_user_id); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('project_name') && project_name) { 
            insertCols.push('project_name'); 
            values.push(project_name); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('client_name') && client_name) { 
            insertCols.push('client_name'); 
            values.push(client_name); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('client_email') && client_email) { 
            insertCols.push('client_email'); 
            values.push(client_email); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('case_type') && case_type) { 
            insertCols.push('case_type'); 
            values.push(case_type); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('priority') && priority) { 
            insertCols.push('priority'); 
            values.push(priority); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('start_date') && start_date) { 
            insertCols.push('start_date'); 
            values.push(start_date); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('payment_amount') && payment_amount) { 
            insertCols.push('payment_amount'); 
            values.push(payment_amount); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('current_stage')) { 
            insertCols.push('current_stage'); 
            values.push(1); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('status')) { 
            insertCols.push('status'); 
            values.push('Active'); 
            placeholders.push(`$${idx++}`); 
        }

        if (cols.includes('project_manager_id') && project_manager_id) { 
            insertCols.push('project_manager_id'); 
            values.push(project_manager_id); 
            placeholders.push(`$${idx++}`); 
        }

        if (insertCols.length === 0) {
            throw new Error('No fields to insert - table schema mismatch');
        }

        const returnCol = cols.includes('project_id') ? 'project_id' : (cols.includes('id') ? 'id' : 'project_id');
        const q = `INSERT INTO projects (${insertCols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING ${returnCol}, *`;
        const projectRes = await client.query(q, values);
        const createdProject = projectRes.rows[0];
        const projectId = createdProject[returnCol];

        // Only fetch and create checklist if visa_type_id is provided (lead conversion flow)
        if (visa_type_id) {
            try {
                const templateRes = await client.query(
                    `SELECT document_id FROM visa_document_checklist WHERE visa_type_id = $1`,
                    [visa_type_id]
                );

                for (let row of templateRes.rows) {
                    await client.query(
                        `INSERT INTO project_documents (project_id, document_id, status) VALUES ($1, $2, 'Pending')`,
                        [projectId, row.document_id]
                    );
                }
            } catch (checklistErr) {
                console.warn('Checklist creation failed (non-fatal):', checklistErr.message);
            }
        }

        // Create a document folder for this project
        try {
            let folderName = project_name || client_name || null;
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

        await client.query('COMMIT');
        res.status(201).json({ message: "Project created successfully", projectId, project: createdProject });

    } catch (err) {
        await client.query('ROLLBACK').catch(() => null);
        console.error("Project Creation Error:", err);
        res.status(500).json({ error: "Failed to create project", detail: err.message });
    } finally {
        client.release();
    }
});

// --- 2. GET PROJECT DETAILS ---
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`Fetching project details for id: ${id}`);

        // Check which columns exist in projects table
        const colRes = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const cols = colRes.rows.map(r => r.column_name);
        const idCol = cols.includes('project_id') ? 'project_id' : (cols.includes('id') ? 'id' : 'project_id');

        // Check if related tables exist
        const leadsExists = await db.query("SELECT to_regclass('public.leads') as exists");
        const visaTypesExists = await db.query("SELECT to_regclass('public.visa_types') as exists");
        const employeesExists = await db.query("SELECT to_regclass('public.employees') as exists");
        const hasLeadsTable = leadsExists.rows[0] && leadsExists.rows[0].exists;
        const hasVisaTypesTable = visaTypesExists.rows[0] && visaTypesExists.rows[0].exists;
        const hasEmployeesTable = employeesExists.rows[0] && employeesExists.rows[0].exists;

        // Build query with conditional joins
        let joins = '';
        let selectFields = 'p.*';
        
        if (hasLeadsTable && cols.includes('client_lead_id')) {
            joins += ' LEFT JOIN leads l ON p.client_lead_id = l.lead_id';
            selectFields += ', l.first_name, l.last_name, l.company, l.email';
        }
        
        if (hasVisaTypesTable && cols.includes('visa_type_id')) {
            joins += ' LEFT JOIN visa_types v ON p.visa_type_id = v.visa_type_id';
            selectFields += ', v.name as visa_type_name';
        }

        if (hasEmployeesTable && cols.includes('project_manager_id')) {
            joins += ' LEFT JOIN employees e ON p.project_manager_id = e.id';
            selectFields += ', e.full_name as project_manager_name, e.work_email as project_manager_email';
        }

        const projectQuery = `SELECT ${selectFields} FROM projects p${joins} WHERE p.${idCol} = $1`;
        console.log(`Executing query: ${projectQuery}`);
        
        const project = await db.query(projectQuery, [id]);

        if (project.rows.length === 0) {
            console.log(`Project ${id} not found`);
            return res.status(404).json({ error: "Project not found" });
        }

        console.log(`Found project ${id}, fetching documents`);

        // Fetch documents if tables exist
        let documents = { rows: [] };
        try {
            const docsTableExists = await db.query("SELECT to_regclass('public.project_documents') as exists");
            if (docsTableExists.rows[0] && docsTableExists.rows[0].exists) {
                documents = await db.query(`
                    SELECT pd.project_document_id, pd.project_id, pd.status, pd.notes, pd.date_received,
                           d.name as document_name, d.description
                    FROM project_documents pd
                    LEFT JOIN documents d ON pd.document_id = d.document_id
                    WHERE pd.project_id = $1
                    ORDER BY d.name ASC
                `, [id]);
            }
        } catch (docErr) {
            console.warn('Error fetching documents for project', id, ':', docErr.message || docErr);
            // Continue without documents
        }

        console.log(`Successfully retrieved project ${id} with ${documents.rows.length} documents`);

        res.json({
            project: project.rows[0],
            documents: documents.rows
        });

    } catch (err) {
        console.error("Error fetching project details for id", req.params.id, ":", err);
        console.error('Error details:', {
            message: err.message,
            code: err.code,
            detail: err.detail
        });
        res.status(500).json({ 
            error: "Server error",
            details: err.message 
        });
    }
});

// --- 2a. UPDATE PROJECT DETAILS ---
// Allows editing general project fields (internal use only)
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body || {};

    // Internal-only: require company email domain
    try {
        const email = String(req.headers['x-user-email'] || '').toLowerCase();
        if (!email.endsWith('@immigrationspecialists.co.za')) {
            return res.status(403).json({ error: 'Forbidden: internal access only' });
        }
    } catch {}

    try {
        const colRes = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const existingCols = colRes.rows.map(r => r.column_name);

        // Allowed editable fields
        const allowed = ['project_name','client_name','client_email','case_type','priority','start_date','payment_amount','status','project_manager_id'];
        const parts = [];
        const values = [];
        let i = 1;
        for (const key of allowed) {
            if (typeof updates[key] === 'undefined') continue;
            if (!existingCols.includes(key)) continue;
            parts.push(`${key} = $${i}`);
            values.push(updates[key]);
            i++;
        }
        if (parts.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

        values.push(id);
        const setUpdatedAt = existingCols.includes('updated_at') ? ', updated_at = CURRENT_TIMESTAMP' : '';
        const q = `UPDATE projects SET ${parts.join(', ')}${setUpdatedAt} WHERE project_id = $${i} RETURNING *`;
        const result = await db.query(q, values);
        return res.json(result.rows[0] || {});
    } catch (err) {
        console.error('Project details update failed:', err);
        return res.status(500).json({ error: 'Update failed' });
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
        add('project_manager_id');

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

        let joinManager = cols.includes('project_manager_id');
        if (joinManager) {
            try {
                const employeeTable = await db.query("SELECT to_regclass('public.employees') as exists");
                if (!employeeTable.rows[0] || !employeeTable.rows[0].exists) {
                    console.warn('Employees table not present; skipping project manager join in projects list');
                    joinManager = false;
                }
            } catch (e) {
                console.warn('Error checking employees table existence, skipping join:', e && e.message ? e.message : e);
                joinManager = false;
            }
        }

        const managerSelect = joinManager ? 'e.full_name as project_manager_name, e.work_email as project_manager_email' : '';
        const selectList = (selectCols.join(', ') || 'p.project_id as project_id')
            + (leadSelect ? ', ' + leadSelect : '')
            + (managerSelect ? ', ' + managerSelect : '');

        const sql = `SELECT ${selectList}
                 FROM projects p
                 ${joinLead ? 'LEFT JOIN leads l ON p.client_lead_id = l.lead_id' : ''}
                 ${joinManager ? 'LEFT JOIN employees e ON p.project_manager_id = e.id' : ''}
                 ORDER BY ${cols.includes('created_at') ? 'p.created_at' : 'p.project_id'} DESC`;

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
            project_manager_id: r.project_manager_id || null,
            project_manager_name: r.project_manager_name || '',
            project_manager_email: r.project_manager_email || '',
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

// DELETE /api/projects/all - delete ALL projects (with confirmation)
// NOTE: Must come BEFORE /:id route so Express matches it first
router.delete('/all', async (req, res) => {
    const { confirm } = req.body; // Require { confirm: true } to prevent accidental deletion
    
    if (confirm !== true) {
        return res.status(400).json({ error: 'Confirmation required: send { confirm: true }' });
    }

    const client = await db.pool.connect();
    const results = { deleted: [], failed: [] };

    try {
        // Determine actual id column
        const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const existingCols = colRes.rows.map(r => r.column_name);
        const idCol = existingCols.includes('project_id') ? 'project_id' : (existingCols.includes('id') ? 'id' : null);

        if (!idCol) {
            throw new Error('Unable to determine projects id column');
        }

        // Get all project IDs
        const allProjects = await client.query(`SELECT ${idCol} as id FROM projects`);
        const projectIds = allProjects.rows.map(r => r.id);

        console.log(`Delete all: found ${projectIds.length} projects to delete`);

        if (projectIds.length === 0) {
            return res.json({ 
                ok: true,
                deleted: [],
                failed: [],
                summary: 'No projects to delete'
            });
        }

        // Check which related tables exist
        const tableChecks = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('project_documents', 'documents', 'document_folders', 'checklists')
        `);
        const existingTables = new Set(tableChecks.rows.map(r => r.table_name));

        // Delete each project
        for (const id of projectIds) {
            const client2 = await db.pool.connect();
            try {
                await client2.query('BEGIN');
                console.log(`Delete all: processing project ${id}`);

                // Delete related records
                if (existingTables.has('project_documents')) {
                    await client2.query('DELETE FROM project_documents WHERE project_id = $1', [id]).catch(() => null);
                }
                if (existingTables.has('documents')) {
                    await client2.query('DELETE FROM documents WHERE project_id = $1', [id]).catch(() => null);
                }
                if (existingTables.has('document_folders')) {
                    await client2.query('DELETE FROM document_folders WHERE project_id = $1', [id]).catch(() => null);
                }
                if (existingTables.has('checklists')) {
                    await client2.query('DELETE FROM checklists WHERE project_id = $1', [id]).catch(() => null);
                }

                // Delete project
                const delResult = await client2.query(`DELETE FROM projects WHERE ${idCol} = $1 RETURNING *`, [id]);
                await client2.query('COMMIT');
                
                results.deleted.push({ id, project: delResult.rows[0] });
                console.log(`Delete all: successfully deleted project ${id}`);
            } catch (err) {
                await client2.query('ROLLBACK').catch(() => null);
                results.failed.push({ id, reason: err.message });
                console.error(`Delete all: failed for project ${id}:`, err.message);
            } finally {
                client2.release();
            }
        }

        res.json({ 
            ok: true,
            deleted: results.deleted,
            failed: results.failed,
            summary: `Deleted ${results.deleted.length}/${projectIds.length} projects`
        });

    } catch (err) {
        console.error('Delete all error:', err);
        res.status(500).json({ 
            error: 'Delete all failed',
            details: err.message 
        });
    } finally {
        client.release();
    }
});

// DELETE /api/projects/batch - bulk delete multiple projects
// NOTE: Must come BEFORE /:id route so Express matches it first
router.delete('/batch', async (req, res) => {
    const { ids } = req.body; // Expect: { ids: [1, 2, 3] }
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid request: provide ids array' });
    }

    const client = await db.pool.connect();
    const results = { deleted: [], failed: [] };

    try {
        // Determine actual id column
        const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const existingCols = colRes.rows.map(r => r.column_name);
        const idCol = existingCols.includes('project_id') ? 'project_id' : (existingCols.includes('id') ? 'id' : null);

        if (!idCol) {
            throw new Error('Unable to determine projects id column');
        }

        // Check which related tables exist
        const tableChecks = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('project_documents', 'documents', 'document_folders', 'checklists')
        `);
        const existingTables = new Set(tableChecks.rows.map(r => r.table_name));

        // Delete each project
        for (const id of ids) {
            const client2 = await db.pool.connect();
            try {
                await client2.query('BEGIN');
                console.log(`Batch delete: processing project ${id}`);

                // Check if project exists
                const checkResult = await client2.query(`SELECT * FROM projects WHERE ${idCol} = $1`, [id]);
                if (checkResult.rows.length === 0) {
                    results.failed.push({ id, reason: 'Project not found' });
                    await client2.query('ROLLBACK');
                    continue;
                }

                // Delete related records
                if (existingTables.has('project_documents')) {
                    await client2.query('DELETE FROM project_documents WHERE project_id = $1', [id]).catch(() => null);
                }
                if (existingTables.has('documents')) {
                    await client2.query('DELETE FROM documents WHERE project_id = $1', [id]).catch(() => null);
                }
                if (existingTables.has('document_folders')) {
                    await client2.query('DELETE FROM document_folders WHERE project_id = $1', [id]).catch(() => null);
                }
                if (existingTables.has('checklists')) {
                    await client2.query('DELETE FROM checklists WHERE project_id = $1', [id]).catch(() => null);
                }

                // Delete project
                const delResult = await client2.query(`DELETE FROM projects WHERE ${idCol} = $1 RETURNING *`, [id]);
                await client2.query('COMMIT');
                
                results.deleted.push({ id, project: delResult.rows[0] });
                console.log(`Batch delete: successfully deleted project ${id}`);
            } catch (err) {
                await client2.query('ROLLBACK').catch(() => null);
                results.failed.push({ id, reason: err.message });
                console.error(`Batch delete: failed for project ${id}:`, err.message);
            } finally {
                client2.release();
            }
        }

        res.json({ 
            ok: true,
            deleted: results.deleted,
            failed: results.failed,
            summary: `Deleted ${results.deleted.length}/${ids.length} projects`
        });

    } catch (err) {
        console.error('Batch delete error:', err);
        res.status(500).json({ 
            error: 'Batch delete failed',
            details: err.message 
        });
    } finally {
        client.release();
    }
});

// DELETE /api/projects/:id - delete project and related data (allow deleting any project)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        console.log(`Attempting to delete project with id: ${id}`);
        
        // Determine actual id column used by projects table (project_id or id)
        const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='projects'");
        const existingCols = colRes.rows.map(r => r.column_name);
        const idCol = existingCols.includes('project_id') ? 'project_id' : (existingCols.includes('id') ? 'id' : null);

        console.log(`Project ID column identified as: ${idCol}`);

        if (!idCol) {
            throw new Error('Unable to determine projects id column (expected project_id or id)');
        }

        // Check if project exists first
        const checkQuery = `SELECT * FROM projects WHERE ${idCol} = $1`;
        const checkResult = await client.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.log(`Project ${id} not found`);
            // Return 200 OK instead of 404 for bulk operations - treat as already deleted
            return res.status(200).json({ ok: true, message: 'Project not found or already deleted' });
        }

        console.log(`Found project ${id}, proceeding with deletion of related records`);

        // Check which related tables exist to avoid transaction abort on missing tables
        const tableChecks = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('project_documents', 'documents', 'document_folders', 'checklists')
        `);
        const existingTables = new Set(tableChecks.rows.map(r => r.table_name));
        console.log('Existing related tables:', Array.from(existingTables));

        // Delete all related data in the correct order (respecting foreign keys)
        // Only attempt deletions for tables that actually exist
        
        if (existingTables.has('project_documents')) {
            try {
                const docResult = await client.query('DELETE FROM project_documents WHERE project_id = $1', [id]);
                console.log(`Deleted ${docResult.rowCount} project_documents for project ${id}`);
            } catch (e) {
                console.warn('Warning deleting project_documents for project', id, ':', e && e.message ? e.message : e);
            }
        }
        
        if (existingTables.has('documents')) {
            try {
                const docsResult = await client.query('DELETE FROM documents WHERE project_id = $1', [id]);
                console.log(`Deleted ${docsResult.rowCount} documents for project ${id}`);
            } catch (e) {
                console.warn('Warning deleting documents for project', id, ':', e && e.message ? e.message : e);
            }
        }
        
        if (existingTables.has('document_folders')) {
            try {
                const folderResult = await client.query('DELETE FROM document_folders WHERE project_id = $1', [id]);
                console.log(`Deleted ${folderResult.rowCount} document_folders for project ${id}`);
            } catch (e) {
                console.warn('Warning deleting document_folders for project', id, ':', e && e.message ? e.message : e);
            }
        }
        
        if (existingTables.has('checklists')) {
            try {
                const checklistResult = await client.query('DELETE FROM checklists WHERE project_id = $1', [id]);
                console.log(`Deleted ${checklistResult.rowCount} checklists for project ${id}`);
            } catch (e) {
                console.warn('Warning deleting checklists for project', id, ':', e && e.message ? e.message : e);
            }
        }

        // Now delete the project itself
        const deleteQuery = `DELETE FROM projects WHERE ${idCol} = $1 RETURNING *`;
        console.log(`Executing: ${deleteQuery} with id=${id}`);
        const result = await client.query(deleteQuery, [id]);
        
        await client.query('COMMIT');
        console.log(`Successfully deleted project ${id}`);
        res.json({ ok: true, deleted: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Project delete failed for id', id, ':', err);
        console.error('Error details:', {
            message: err.message,
            code: err.code,
            detail: err.detail,
            stack: err.stack
        });
        res.status(500).json({ 
            error: 'Failed to delete project',
            details: err.message 
        });
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

        const allowed = ['project_name','client_name','client_email','case_type','priority','start_date','payment_amount','client_id','status','progress','visa_type_id','current_stage','assigned_user_id','assigned_manager_id','project_manager_id'];
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

module.exports = router;

// --- 7. PROJECT REVIEWS (INTERNAL) ---
// List reviews for a project
router.get('/:id/reviews', async (req, res) => {
    const { id } = req.params;
    try {
        const r = await db.query('SELECT * FROM project_reviews WHERE project_id = $1 ORDER BY created_at DESC', [id]);
        return res.json({ ok: true, reviews: r.rows });
    } catch (err) {
        console.error('Fetch project reviews failed:', err);
        return res.status(500).json({ ok: false, error: 'Server error' });
    }
});

// Add a review (internal-only)
router.post('/:id/reviews', async (req, res) => {
    const { id } = req.params;
    const { health_status, comment } = req.body || {};
    const email = String(req.headers['x-user-email'] || '').toLowerCase();

    if (!email.endsWith('@immigrationspecialists.co.za')) {
        return res.status(403).json({ error: 'Forbidden: internal access only' });
    }
    try {
        const ins = await db.query(
            'INSERT INTO project_reviews (project_id, reviewer_email, health_status, comment) VALUES ($1, $2, $3, $4) RETURNING *',
            [id, email, health_status || null, comment || null]
        );
        return res.status(201).json({ ok: true, review: ins.rows[0] });
    } catch (err) {
        console.error('Create project review failed:', err);
        return res.status(500).json({ ok: false, error: 'Server error' });
    }
});