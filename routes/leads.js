const express = require('express');
const router = express.Router();
const db = require('../db');
console.log('Loaded routes/leads.js');

// --- 1. GET ALL LEADS (List/Kanban View) ---
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                l.*, 
                ps.name as stage_name, 
                u.first_name as assigned_to_name,
                u.last_name as assigned_to_last_name
            FROM leads l
            LEFT JOIN prospect_stages ps ON l.current_stage_id = ps.stage_id
            LEFT JOIN users u ON l.assigned_user_id = u.user_id
            WHERE l.converted IS NOT TRUE OR l.converted IS NULL
            ORDER BY l.updated_at DESC
        `);
        
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

// --- 2. UPDATE LEAD STAGE (Moving lead through cold funnel or prospect pipeline) ---
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

// --- 3. ADD COMMENT TO LEAD ---
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

// --- 4. MARK LEAD AS LOST ---
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

// --- 5. DELETE LEAD (for duplicates) ---
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

// --- 6. ZAPIER / WEBHOOK ENDPOINT (Lead Ingestion) ---
// Public endpoint for POST requests from Zapier
// Endpoint: POST /api/leads/webhook
router.post('/webhook', async (req, res) => {
    const { 
        first_name, last_name, email, phone, company, 
        source = 'Webhook', 
        source_id = null, 
        form_name = null 
    } = req.body;

    // Basic validation
    if (!first_name || !last_name || !email) {
        return res.status(400).json({ error: "Missing required fields (first_name, last_name, email)." });
    }

    try {
        // Check for existing lead by email
        const existing = await db.query('SELECT lead_id, notes FROM leads WHERE email = $1', [email]);
        
        if (existing.rows.length > 0) {
            // Update notes on existing lead to log the new inquiry
            const lead = existing.rows[0];
            const newNote = `\n[${new Date().toISOString()}] New inquiry received via ${source} (Form: ${form_name || 'N/A'})`;
            await db.query(
                `UPDATE leads SET notes = CONCAT($1, $2), updated_at = CURRENT_TIMESTAMP WHERE lead_id = $3`,
                [lead.notes || '', newNote, lead.lead_id]
            );
            return res.status(200).json({ message: "Lead already exists; updated notes.", id: lead.lead_id });
        }

        // Create new lead in Stage 1 (Opportunity)
        const result = await db.query(`
            INSERT INTO leads (
                first_name, last_name, email, phone, company, 
                source, source_id, form_id, current_stage_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1) 
            RETURNING lead_id`,
            [first_name, last_name, email, phone, company, source, source_id, form_name]
        );

        res.status(201).json({ message: "New Lead created successfully", id: result.rows[0].lead_id });
    } catch (err) {
        console.error("Webhook Error:", err);
        res.status(500).json({ error: "Failed to process webhook" });
    }
});

module.exports = router;

// --- 7. CONVERT LEAD TO PROSPECT ---
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