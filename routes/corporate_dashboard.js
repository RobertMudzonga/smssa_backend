const express = require('express');
const router = express.Router();
const db = require('../db');

// --- 1. MESSAGING API ---

/**
 * GET /api/corporate-dashboard/messages
 * Fetch chat history for a corporate client
 */
router.get('/messages', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token required' });

        // First find the corporate client by token
        const corpRes = await db.query('SELECT corporate_id FROM corporate_clients WHERE access_token = $1', [token]);
        if (corpRes.rows.length === 0) return res.status(404).json({ error: 'Invalid token' });
        
        const corporateId = corpRes.rows[0].corporate_id;

        const messages = await db.query(`
            SELECT cm.*, e.full_name as sender_name
            FROM corporate_messages cm
            LEFT JOIN employees e ON cm.sender_id = e.id
            WHERE cm.corporate_id = $1
            ORDER BY cm.created_at ASC
        `, [corporateId]);

        res.json({
            messages: messages.rows.map(m => ({
                id: m.message_id,
                sender: m.is_from_client ? 'client' : 'manager',
                sender_name: m.is_from_client ? 'You' : (m.sender_name || 'Case Manager'),
                text: m.message_text,
                timestamp: m.created_at
            }))
        });
    } catch (err) {
        console.error('Error fetching corporate messages:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * POST /api/corporate-dashboard/messages
 * Send a message from the corporate client
 */
router.post('/messages', async (req, res) => {
    try {
        const { token, text } = req.body;
        if (!token || !text) return res.status(400).json({ error: 'Token and text required' });

        const corpRes = await db.query('SELECT corporate_id FROM corporate_clients WHERE access_token = $1', [token]);
        if (corpRes.rows.length === 0) return res.status(404).json({ error: 'Invalid token' });
        
        const corporateId = corpRes.rows[0].corporate_id;

        const result = await db.query(`
            INSERT INTO corporate_messages (corporate_id, is_from_client, message_text)
            VALUES ($1, true, $2)
            RETURNING *
        `, [corporateId, text]);

        res.json({
            success: true,
            message: result.rows[0]
        });
    } catch (err) {
        console.error('Error sending corporate message:', err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// --- 2. REPORTS API ---

/**
 * GET /api/corporate-dashboard/reports/summary
 * Aggregate status of all cases/projects for a corporate client
 */
router.get('/reports/summary', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token required' });

        const corpRes = await db.query('SELECT corporate_id FROM corporate_clients WHERE access_token = $1', [token]);
        if (corpRes.rows.length === 0) return res.status(404).json({ error: 'Invalid token' });
        const corporateId = corpRes.rows[0].corporate_id;

        const stats = await db.query(`
            SELECT 
                case_status as status,
                count(*) as count
            FROM legal_cases 
            WHERE corporate_client_id = $1
            GROUP BY case_status
        `, [corporateId]);

        res.json({
            report_name: "Employee Status Summary",
            data: stats.rows,
            generated_at: new Date()
        });
    } catch (err) {
        console.error('Error generating status summary:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

/**
 * GET /api/corporate-dashboard/reports/expiring-visas
 * Find visas expiring within 90/180 days
 */
router.get('/reports/expiring-visas', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token required' });

        const corpRes = await db.query('SELECT corporate_id FROM corporate_clients WHERE access_token = $1', [token]);
        if (corpRes.rows.length === 0) return res.status(404).json({ error: 'Invalid token' });
        const corporateId = corpRes.rows[0].corporate_id;

        const expiring = await db.query(`
            SELECT 
                case_title as employee_name,
                case_type as visa_type,
                next_deadline as expiration_date,
                priority
            FROM legal_cases 
            WHERE corporate_client_id = $1 
            AND next_deadline <= CURRENT_DATE + INTERVAL '180 days'
            ORDER BY next_deadline ASC
        `, [corporateId]);

        res.json({
            report_name: "Expiring Visas Report",
            data: expiring.rows,
            generated_at: new Date()
        });
    } catch (err) {
        console.error('Error generating expiring visas report:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

/**
 * GET /api/corporate-dashboard/reports/document-audit
 * Identify missing or pending documents
 */
router.get('/reports/document-audit', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token required' });

        const corpRes = await db.query('SELECT corporate_id FROM corporate_clients WHERE access_token = $1', [token]);
        if (corpRes.rows.length === 0) return res.status(404).json({ error: 'Invalid token' });
        const corporateId = corpRes.rows[0].corporate_id;

        // Simplified audit: cases with pending status
        const audit = await db.query(`
            SELECT 
                case_title as employee_name,
                case_reference as reference,
                case_status as status,
                current_step as pending_step
            FROM legal_cases 
            WHERE corporate_client_id = $1 
            AND (case_status = 'active' OR case_status = 'on_hold')
            ORDER BY case_title ASC
        `, [corporateId]);

        res.json({
            report_name: "Document Audit Report",
            data: audit.rows,
            generated_at: new Date()
        });
    } catch (err) {
        console.error('Error generating document audit:', err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// Original Auth Routes (modified to use DB if needed, but keeping simple for now)
const corporates = [
    { id: 1, name: "Action Aid International", contact: "Munya", token: "aa-secure-token-2024" }
];

router.get('/validate', (req, res) => {
    const { token } = req.query;
    // In production, fetch from DB. For now, matching the existing logic
    if (token === 'aa-secure-token-2024') {
        return res.json({
            success: true,
            company: { id: 1, name: "Action Aid International", requiresPassword: true }
        });
    }
    res.status(401).json({ error: 'invalid-token' });
});

router.post('/login', (req, res) => {
    const { token, password } = req.body;
    if (token === 'aa-secure-token-2024' && password === 'CORPORATE') {
        return res.json({
            success: true,
            company: { corporate_id: 1, name: "Action Aid International" }
        });
    }
    res.status(401).json({ error: 'Invalid access code' });
});

router.get('/employees', async (req, res) => {
    try {
        const { token } = req.query;
        const corpRes = await db.query('SELECT corporate_id FROM corporate_clients WHERE access_token = $1', [token]);
        if (corpRes.rows.length === 0) return res.status(404).json({ error: 'Invalid token' });
        
        const corporateId = corpRes.rows[0].corporate_id;
        const employees = await db.query(`
            SELECT case_id as id, case_title as full_name, case_type as visa_type, case_status as status, 
                   CAST((current_step * 100 / 6) AS INTEGER) as progress
            FROM legal_cases 
            WHERE corporate_client_id = $1
        `, [corporateId]);
        
        res.json({ employees: employees.rows });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
});

module.exports = router;
