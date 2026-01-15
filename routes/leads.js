const express = require('express');
const router = express.Router();
const db = require('../db');
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null;

// --- 1. GET ALL LEADS (List/Kanban View) ---
router.get('/', async (req, res) => {
    try {
        const { assigned_employee_id } = req.query;
        
        // First check if leads table exists
        const leadsExists = await db.query("SELECT to_regclass('public.leads') as exists");
        if (!leadsExists.rows[0] || !leadsExists.rows[0].exists) {
            console.warn('leads table not found - returning empty array');
            return res.json([]);
        }

        // Check if prospect_stages table exists
        const psExists = await db.query("SELECT to_regclass('public.prospect_stages') as exists");
        const hasProspectStages = psExists.rows[0] && psExists.rows[0].exists;

        // Build WHERE clause for filtering
        const whereConditions = ['(l.converted IS NOT TRUE OR l.converted IS NULL)'];
        const queryParams = [];
        
        if (assigned_employee_id) {
            if (assigned_employee_id === 'unassigned') {
                whereConditions.push('l.assigned_employee_id IS NULL');
            } else {
                queryParams.push(assigned_employee_id);
                whereConditions.push(`l.assigned_employee_id = $${queryParams.length}`);
            }
        }
        
        const whereClause = whereConditions.join(' AND ');

        let result;
        if (hasProspectStages) {
            // Use full query with joins if tables exist
            result = await db.query(`
                SELECT 
                    l.*, 
                    ps.name as stage_name, 
                    e.full_name as assigned_to_name
                FROM leads l
                LEFT JOIN prospect_stages ps ON l.current_stage_id = ps.stage_id
                LEFT JOIN employees e ON l.assigned_employee_id = e.id
                WHERE ${whereClause}
                ORDER BY l.updated_at DESC
            `, queryParams);
        } else {
            // Fallback: simple query without joins
            result = await db.query(`
                SELECT l.*
                FROM leads l
                WHERE ${whereClause}
                ORDER BY l.updated_at DESC
            `, queryParams);
        }
        
        // Use cold_lead_stage if it exists, otherwise default to 101 (First Contact)
        const transformedLeads = result.rows.map(lead => ({
            ...lead,
            current_stage_id: lead.cold_lead_stage || 101
        }));
        
        res.json(transformedLeads);
    } catch (err) {
        console.error("Error fetching leads:", err);
        console.error('Error details:', err.message);
        console.error('Error code:', err.code);
        res.status(500).json({ error: "Server error fetching leads", detail: err.message });
    }
});

// --- 2. GET SINGLE LEAD WITH FULL DETAILS (including form responses) ---
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await db.query(`
            SELECT 
                l.*,
                ps.name as stage_name,
                e.full_name as assigned_to_name,
                e.work_email as assigned_to_email
            FROM leads l
            LEFT JOIN prospect_stages ps ON l.current_stage_id = ps.stage_id
            LEFT JOIN employees e ON l.assigned_employee_id = e.id
            WHERE l.lead_id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }
        
        const lead = result.rows[0];
        // Use cold_lead_stage if it exists
        if (lead.cold_lead_stage) {
            lead.current_stage_id = lead.cold_lead_stage;
        }
        
        res.json(lead);
    } catch (err) {
        console.error('Error fetching lead details:', err);
        res.status(500).json({ error: 'Failed to fetch lead details', detail: err.message });
    }
});

// --- 3. UPDATE LEAD STAGE (Moving lead through cold funnel or prospect pipeline) ---
router.patch('/:id/stage', async (req, res) => {
    const { id } = req.params;
    const { stage_id } = req.body; // Can be 1-13 (prospect stages) or 101-104 (cold lead stages)
    
    // Handle cold lead stages (101-104)
    if (stage_id >= 101 && stage_id <= 104) {
        try {
            const result = await db.query(
                `UPDATE leads SET cold_lead_stage = $1, updated_at = CURRENT_TIMESTAMP WHERE lead_id = $2 RETURNING *`,
                [stage_id, id]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Lead not found" });
            }
            // Return with cold_lead_stage as current_stage_id for frontend
            res.json({ ...result.rows[0], current_stage_id: result.rows[0].cold_lead_stage });
        } catch (err) {
            console.error("Error updating lead cold stage:", err);
            res.status(500).json({ error: "Failed to update cold lead stage" });
        }
        return;
    }
    
    // Handle prospect pipeline stages (1-13)
    const allowedStageIDs = Array.from({ length: 13 }, (_, i) => i + 1);

    if (!stage_id || !allowedStageIDs.includes(stage_id)) {
        return res.status(400).json({ error: "Invalid stage_id provided." });
    }

    try {
        const result = await db.query(
            `UPDATE leads SET current_stage_id = $1, updated_at = CURRENT_TIMESTAMP WHERE lead_id = $2 RETURNING *`,
            [stage_id, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Lead not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error updating lead stage:", err);
        res.status(500).json({ error: "Failed to update stage" });
    }
});

// --- 4. ASSIGN LEAD TO EMPLOYEE (Salesperson) ---
router.patch('/:id/assign', async (req, res) => {
    const { id } = req.params;
    const { employee_id } = req.body;

    if (!employee_id) {
        return res.status(400).json({ error: 'employee_id is required' });
    }

    try {
        // Get the lead details
        const leadResult = await db.query(
            'SELECT * FROM leads WHERE lead_id = $1',
            [id]
        );

        if (leadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const lead = leadResult.rows[0];

        // Get employee details
        const employeeResult = await db.query(
            'SELECT id, full_name, work_email FROM employees WHERE id = $1',
            [employee_id]
        );

        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const employee = employeeResult.rows[0];

        // Update lead with assignment
        const updateResult = await db.query(
            `UPDATE leads 
            SET assigned_employee_id = $1, assigned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE lead_id = $2 
            RETURNING *`,
            [employee_id, id]
        );

        // Create notification for the assigned employee
        const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Unknown Lead';
        const notificationTitle = 'New Lead Assigned';
        const notificationMessage = `You have been assigned a new lead: ${leadName} from ${lead.company || 'Unknown Company'}`;

        await db.query(
            `INSERT INTO notifications (
                employee_id, type, title, message, 
                related_entity_type, related_entity_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
            [employee_id, 'lead_assigned', notificationTitle, notificationMessage, 'lead', id]
        );

        res.json({
            message: 'Lead assigned successfully',
            lead: updateResult.rows[0],
            assigned_to: employee.full_name
        });
    } catch (err) {
        console.error('Error assigning lead:', err);
        res.status(500).json({ error: 'Failed to assign lead', detail: err.message });
    }
});

// --- 5. ADD COMMENT TO LEAD ---
router.patch('/:id/comment', async (req, res) => {
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment) {
        return res.status(400).json({ error: 'Comment is required' });
    }

    try {
        const leadResult = await db.query('SELECT notes FROM leads WHERE lead_id = $1', [id]);
        if (leadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const existingNotes = leadResult.rows[0].notes || '';
        const newNote = `${existingNotes}\n[${new Date().toISOString()}] ${comment}`;

        const result = await db.query(
            `UPDATE leads SET notes = $1, updated_at = CURRENT_TIMESTAMP WHERE lead_id = $2 RETURNING *`,
            [newNote, id]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error adding comment:', err);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// --- 6. MARK LEAD AS LOST ---
router.patch('/:id/lost', async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
        return res.status(400).json({ error: 'Reason is required' });
    }

    try {
        const leadResult = await db.query('SELECT notes FROM leads WHERE lead_id = $1', [id]);
        if (leadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const existingNotes = leadResult.rows[0].notes || '';
        const lostNote = `${existingNotes}\n[${new Date().toISOString()}] MARKED AS LOST: ${reason}`;

        const result = await db.query(
            `UPDATE leads SET notes = $1, converted = FALSE, cold_lead_stage = NULL, updated_at = CURRENT_TIMESTAMP WHERE lead_id = $2 RETURNING *`,
            [lostNote, id]
        );

        res.json({ message: 'Lead marked as lost', lead: result.rows[0] });
    } catch (err) {
        console.error('Error marking lead as lost:', err);
        res.status(500).json({ error: 'Failed to mark lead as lost' });
    }
});

// --- 7. DELETE LEAD (for duplicates) ---
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query('DELETE FROM leads WHERE lead_id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        res.json({ message: 'Lead deleted successfully', lead: result.rows[0] });
    } catch (err) {
        console.error('Error deleting lead:', err);
        res.status(500).json({ error: 'Failed to delete lead' });
    }
});

// --- 8. ZAPIER / WEBHOOK ENDPOINT (Lead Ingestion) ---
// Public endpoint for POST requests from Zapier and other form providers
// Endpoint: POST /api/leads/webhook
router.post('/webhook', async (req, res) => {
    // Optional token-based protection: set WEBHOOK_SECRET env var and send header
    if (WEBHOOK_SECRET) {
        const token = req.headers['x-webhook-token'] || req.headers['x-zapier-token'] || req.query.token;
        if (!token || token !== WEBHOOK_SECRET) {
            return res.status(401).json({ error: 'Invalid or missing webhook token' });
        }
    }

    const body = req.body || {};

    // Build a normalized key map to handle Zapier keys like "1. Full Name" / "Phone Number"
    const normalizedBody = {};
    for (const [k, v] of Object.entries(body)) {
        const norm = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
        normalizedBody[norm] = v;
    }

    // Helper: flexible field extraction supporting many Zapier/form providers
    function getField(candidates = []) {
        for (const key of candidates) {
            // 1) exact key match
            if (body[key] !== undefined && body[key] !== null && String(body[key]).trim() !== '') return body[key];

            // 2) normalized key match (handles spaces/punctuation/prefixes)
            const norm = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedBody[norm] !== undefined && normalizedBody[norm] !== null && String(normalizedBody[norm]).trim() !== '') {
                return normalizedBody[norm];
            }
        }
        return null;
    }

    // Extract name parts
    let first_name = getField(['first_name', 'firstname', 'firstName', 'FIRST_NAME', 'given_name', 'givenName']);
    let last_name = getField(['last_name', 'lastname', 'lastName', 'LAST_NAME', 'family_name', 'familyName']);
    const fullName = getField(['name', 'full_name', 'fullName', 'FULL_NAME', 'contact_name', 'ContactName', 'Full Name']);
    if ((!first_name || !last_name) && fullName) {
        const parts = String(fullName).trim().split(/\s+/);
        first_name = first_name || parts[0] || null;
        last_name = last_name || parts.slice(1).join(' ') || parts[0] || null;
    }

    // Extract other fields with common fallbacks
    const email = getField(['email', 'email_address', 'emailAddress', 'EMAIL', 'Email', 'Email Address', 'EmailAddress', '1Email']);
    const phone = getField(['phone', 'PHONE', 'phone_number', 'phoneNumber', 'PHONE_NUMBER', 'mobile', 'Mobile', 'Phone Number', 'PhoneNumber', '1PhoneNumber']);
    const company = getField(['company', 'COMPANY', 'company_name', 'Company', 'organization', 'org', 'Company Name', 'Business']);
    const source = getField(['source', 'SOURCE', 'platform', 'utm_source']) || 'Webhook';
    const source_id = getField(['source_id', 'SOURCE_ID', 'lead_id', 'LEAD_ID', 'zap_id', 'entry_id']) || null;
    const form_name = getField(['form_name', 'FORM_NAME', 'form', 'form_id', 'formName', 'Ad', 'ad', 'ad_name', 'adName', 'Ad Name', 'Form Name']);

    // Extract form responses (question/answer pairs)
    // Look for fields that start with "Raw" or other question patterns
    const form_responses = [];
    const excludedFields = new Set([
        'first_name', 'firstname', 'last_name', 'lastname', 'email', 'phone', 
        'company', 'source', 'form_name', 'form_id', 'source_id',
        'page_id', 'page_name', 'form name', 'ad', 'ad_name'
    ]);
    
    // Helper function to format question text
    function formatQuestionText(text) {
        // Remove "Raw " prefix if present
        let formatted = text.replace(/^Raw\s+/i, '');
        
        // Convert to title case: capitalize first letter of each word
        formatted = formatted.replace(/\b\w/g, char => char.toUpperCase());
        
        return formatted;
    }
    
    for (const [key, value] of Object.entries(body)) {
        const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Skip if it's a standard field or empty value
        if (excludedFields.has(normalizedKey) || !value || String(value).trim() === '') {
            continue;
        }
        
        // Include fields that look like questions (Raw prefix, contain question words, or name fields)
        const isNameField = /name/i.test(key) && !excludedFields.has(normalizedKey);
        if (key.startsWith('Raw') || key.includes('?') || isNameField ||
            /^(Are|Is|Do|Does|Have|Has|What|Which|When|Where|Why|How)/i.test(key)) {
            form_responses.push({
                question: formatQuestionText(key),
                answer: String(value).trim()
            });
        }
    }

    // Basic validation: prefer email, fallback to phone
    if (!email && !phone) {
        return res.status(400).json({ error: 'Missing contact fields: provide email or phone' });
    }

    try {
        // Look up existing lead by email (preferred) or phone
        let existing = null;
        if (email) {
            const r = await db.query('SELECT lead_id, notes FROM leads WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
            if (r.rows.length > 0) existing = r.rows[0];
        }
        if (!existing && phone) {
            const r2 = await db.query('SELECT lead_id, notes FROM leads WHERE phone = $1 LIMIT 1', [phone]);
            if (r2.rows.length > 0) existing = r2.rows[0];
        }

        if (existing) {
            const newNote = `\n[${new Date().toISOString()}] New inquiry received via ${source} (Form: ${form_name || 'N/A'})`;
            await db.query(
                `UPDATE leads SET notes = COALESCE(notes, '') || $1, updated_at = CURRENT_TIMESTAMP WHERE lead_id = $2`,
                [newNote, existing.lead_id]
            );
            return res.status(200).json({ message: 'Lead already exists; updated notes.', id: existing.lead_id });
        }

        // Insert new lead. Use provided name parts or fallbacks.
        const insertFirst = first_name || (fullName ? String(fullName).split(/\s+/)[0] : null);
        const insertLast = last_name || (fullName ? String(fullName).split(/\s+/).slice(1).join(' ') : null);

        const result = await db.query(
            `INSERT INTO leads (
                first_name, last_name, email, phone, company,
                source, source_id, form_id, form_responses, cold_lead_stage, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,101,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING lead_id`,
            [insertFirst, insertLast, email, phone, company, source, source_id, form_name, 
             form_responses.length > 0 ? JSON.stringify(form_responses) : null]
        );

        console.log('Webhook created lead', result.rows[0].lead_id, 'source=', source, 'form=', form_name);
        res.status(201).json({ message: 'New Lead created successfully', id: result.rows[0].lead_id });
    } catch (err) {
        console.error('Webhook Error:', err);
        res.status(500).json({ error: 'Failed to process webhook', detail: err.message });
    }
});

// --- 9. CONVERT LEAD TO PROSPECT ---
// Endpoint: POST /api/leads/:id/convert
// Creates a new prospect record based on an existing lead.
router.post('/:id/convert', async (req, res) => {
    const { id } = req.params;

    try {
        // Fetch lead by ID
        const leadResult = await db.query('SELECT * FROM leads WHERE lead_id = $1', [id]);
        if (leadResult.rows.length === 0) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        const lead = leadResult.rows[0];

        // Insert into prospects table. Adjust column names if your schema differs.
        const insertResult = await db.query(
            `INSERT INTO prospects (
                lead_id, first_name, last_name, email, phone, company, source, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP) RETURNING prospect_id`,
            [lead.lead_id, lead.first_name, lead.last_name, lead.email, lead.phone, lead.company, lead.source]
        );

        // Optionally mark the lead as converted if your leads table has a column like `converted`.
        // This is a best-effort update; if the column doesn't exist it will be silently ignored.
        try {
            await db.query('UPDATE leads SET converted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE lead_id = $1', [id]);
        } catch (ignoreErr) {
            // Ignore — not all schemas will have a `converted` column
        }

        res.status(201).json({ message: 'Lead converted to prospect', id: insertResult.rows[0].prospect_id });
    } catch (err) {
        console.error('Error converting lead to prospect:', err);
        res.status(500).json({ error: 'Failed to convert lead to prospect', detail: err.message });
    }
});

module.exports = router;