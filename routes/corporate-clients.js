/**
 * Corporate Clients Routes
 * 
 * API endpoints for managing corporate clients in the system.
 * Handles CRUD operations and employee access management.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

// ============================================================================
// HELPERS
// ============================================================================

const SUPER_ADMIN_EMAILS = ['robert@immigrationspecialists.co.za', 'munya@immigrationspecialists.co.za'];

function generateAccessToken() {
    return crypto.randomBytes(32).toString('hex');
}

function isSuperAdmin(req) {
    try {
        const email = String(req.headers['x-user-email'] || '').toLowerCase();
        if (!email) return false;
        return SUPER_ADMIN_EMAILS.includes(email);
    } catch (e) {
        return false;
    }
}

// ============================================================================
// ROUTES: Basic CRUD
// ============================================================================

/**
 * GET /api/corporate-clients
 * Get all corporate clients
 */
router.get('/', async (req, res) => {
    try {
        // Check if corporate_clients table exists
        const tableCheck = await db.query(`
            SELECT EXISTS(
                SELECT FROM information_schema.tables 
                WHERE table_name = 'corporate_clients'
            ) as exists
        `);

        if (!tableCheck.rows[0].exists) {
            console.warn('corporate_clients table does not exist yet');
            return res.json({
                corporate_clients: [],
                count: 0
            });
        }

        const { is_active, subscription_status, limit = 100, offset = 0 } = req.query;

        // Simple query without JOIN to test if table is readable
        let query = `SELECT cc.* FROM corporate_clients cc WHERE 1=1`;
        const params = [];
        let paramIdx = 1;

        if (is_active !== undefined) {
            query += ` AND cc.is_active = $${paramIdx++}`;
            params.push(is_active === 'true');
        }

        if (subscription_status) {
            query += ` AND cc.subscription_status = $${paramIdx++}`;
            params.push(subscription_status);
        }

        query += ` ORDER BY cc.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
        params.push(parseInt(limit), parseInt(offset));

        console.log('Executing corporate clients query:', query);
        console.log('Query params:', params);

        const result = await db.query(query, params);

        console.log('Query successful, returned', result.rows.length, 'rows');

        res.json({
            corporate_clients: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching corporate clients:', error.message);
        console.error('Full error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch corporate clients', 
            details: error.message,
            stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
        });
    }
});

/**
 * GET /api/corporate-clients/by-token/:token
 * Get corporate client by access token (for public portal)
 */
router.get('/by-token/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const result = await db.query(`
            SELECT cc.*,
                   em.full_name AS primary_contact_name,
                   em.work_email AS primary_contact_email,
                   em.role AS primary_contact_role,
                   COUNT(lc.case_id) AS total_cases,
                   COUNT(CASE WHEN lc.case_status = 'active' THEN 1 END) AS active_cases
            FROM corporate_clients cc
            LEFT JOIN employees em ON cc.primary_contact_id = em.id
            LEFT JOIN legal_cases lc ON cc.corporate_id = lc.corporate_client_id
            WHERE cc.access_token = $1
            GROUP BY cc.corporate_id, em.id
        `, [token]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Corporate client not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching corporate client by token:', error);
        res.status(500).json({ error: 'Failed to fetch corporate client', details: error.message });
    }
});

/**
 * GET /api/corporate-clients/:id
 * Get a specific corporate client
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT cc.*,
                   em.full_name AS primary_contact_name,
                   em.email AS primary_contact_email,
                   COUNT(lc.case_id) AS total_cases
            FROM corporate_clients cc
            LEFT JOIN employees em ON cc.primary_contact_id = em.id
            LEFT JOIN legal_cases lc ON cc.corporate_id = lc.corporate_client_id
            WHERE cc.corporate_id = $1
            GROUP BY cc.corporate_id, em.id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Corporate client not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching corporate client:', error);
        res.status(500).json({ error: 'Failed to fetch corporate client', details: error.message });
    }
});

/**
 * POST /api/corporate-clients
 * Create a new corporate client
 * Requires: Super admin access
 */
router.post('/', async (req, res) => {
    try {
        // Verify super admin authorization
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ error: 'Forbidden: Only super admins can create corporate clients' });
        }

        const {
            name,
            company_registration_number,
            industry,
            address,
            contact_person_name,
            contact_person_email,
            contact_person_phone,
            primary_contact_id,
            max_users = 10,
            subscription_start,
            subscription_end,
            notes,
            sharepoint_folder_url
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Company name is required' });
        }

        const access_token = generateAccessToken();
        const now = new Date().toISOString();

        const result = await db.query(`
            INSERT INTO corporate_clients (
                name, company_registration_number, industry, address,
                contact_person_name, contact_person_email, contact_person_phone,
                primary_contact_id, access_token, is_active,
                subscription_status, max_users, subscription_start, subscription_end,
                notes, sharepoint_folder_url, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *
        `, [
            name, company_registration_number || null, industry || null, address || null,
            contact_person_name || null, contact_person_email || null, contact_person_phone || null,
            primary_contact_id || null, access_token, true,
            'active', max_users, subscription_start || null, subscription_end || null,
            notes || null, sharepoint_folder_url || null, now, now
        ]);

        res.status(201).json({
            corporate_client: result.rows[0],
            access_link: `${process.env.APP_URL || 'http://localhost:5173'}/corporate-dashboard?token=${access_token}`
        });
    } catch (error) {
        console.error('Error creating corporate client:', error);
        res.status(500).json({ error: 'Failed to create corporate client', details: error.message });
    }
});

/**
 * PATCH /api/corporate-clients/:id
 * Update a corporate client
 */
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = [];
        const values = [];
        let paramIdx = 1;

        const updateFields = [
            'name', 'company_registration_number', 'industry', 'address',
            'contact_person_name', 'contact_person_email', 'contact_person_phone',
            'primary_contact_id', 'is_active', 'subscription_status',
            'max_users', 'subscription_start', 'subscription_end', 'notes',
            'sharepoint_folder_url'
        ];

        for (const field of updateFields) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = $${paramIdx++}`);
                values.push(req.body[field]);
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push(`updated_at = $${paramIdx++}`);
        values.push(new Date().toISOString());

        values.push(id);

        const result = await db.query(`
            UPDATE corporate_clients 
            SET ${updates.join(', ')}
            WHERE corporate_id = $${paramIdx}
            RETURNING *
        `, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Corporate client not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating corporate client:', error);
        res.status(500).json({ error: 'Failed to update corporate client', details: error.message });
    }
});

/**
 * DELETE /api/corporate-clients/:id
 * Delete a corporate client
 * Requires: Super admin access
 */
router.delete('/:id', async (req, res) => {
    try {
        // Verify super admin authorization
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ error: 'Forbidden: Only super admins can delete corporate clients' });
        }

        const { id } = req.params;

        // Check if client has associated cases
        const casesCheck = await db.query(
            'SELECT COUNT(*) as count FROM legal_cases WHERE corporate_client_id = $1',
            [id]
        );

        if (casesCheck.rows[0].count > 0) {
            return res.status(400).json({
                error: 'Cannot delete corporate client with associated cases',
                associated_cases: casesCheck.rows[0].count
            });
        }

        const result = await db.query(
            'DELETE FROM corporate_clients WHERE corporate_id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Corporate client not found' });
        }

        res.json({
            message: 'Corporate client deleted successfully',
            deleted_client: result.rows[0]
        });
    } catch (error) {
        console.error('Error deleting corporate client:', error);
        res.status(500).json({ error: 'Failed to delete corporate client', details: error.message });
    }
});

// ============================================================================
// ROUTES: Employee Access Management
// ============================================================================

/**
 * GET /api/corporate-clients/:id/employees
 * Get employees assigned to a corporate client
 */
router.get('/:id/employees', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT 
                cce.corporate_client_employee_id,
                cce.role,
                cce.can_create_cases,
                cce.can_edit_cases,
                cce.can_delete_cases,
                cce.added_at,
                em.id,
                em.full_name,
                em.email,
                em.department
            FROM corporate_client_employees cce
            JOIN employees em ON cce.employee_id = em.id
            WHERE cce.corporate_client_id = $1
            ORDER BY em.full_name
        `, [id]);

        res.json({
            employees: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching corporate client employees:', error);
        res.status(500).json({ error: 'Failed to fetch employees', details: error.message });
    }
});

/**
 * POST /api/corporate-clients/:id/employees
 * Add an employee to a corporate client
 */
router.post('/:id/employees', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            employee_id,
            role = 'case_manager',
            can_create_cases = true,
            can_edit_cases = true,
            can_delete_cases = false
        } = req.body;

        if (!employee_id) {
            return res.status(400).json({ error: 'employee_id is required' });
        }

        const result = await db.query(`
            INSERT INTO corporate_client_employees (
                corporate_client_id, employee_id, role,
                can_create_cases, can_edit_cases, can_delete_cases
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [id, employee_id, role, can_create_cases, can_edit_cases, can_delete_cases]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.message.includes('duplicate')) {
            return res.status(400).json({ error: 'Employee already assigned to this corporate client' });
        }
        console.error('Error assigning employee to corporate client:', error);
        res.status(500).json({ error: 'Failed to assign employee', details: error.message });
    }
});

/**
 * PATCH /api/corporate-clients/:id/employees/:employeeId
 * Update employee permissions for a corporate client
 */
router.patch('/:id/employees/:employeeId', async (req, res) => {
    try {
        const { id, employeeId } = req.params;
        const { role, can_create_cases, can_edit_cases, can_delete_cases } = req.body;

        const updates = [];
        const values = [];
        let paramIdx = 1;

        if (role !== undefined) {
            updates.push(`role = $${paramIdx++}`);
            values.push(role);
        }
        if (can_create_cases !== undefined) {
            updates.push(`can_create_cases = $${paramIdx++}`);
            values.push(can_create_cases);
        }
        if (can_edit_cases !== undefined) {
            updates.push(`can_edit_cases = $${paramIdx++}`);
            values.push(can_edit_cases);
        }
        if (can_delete_cases !== undefined) {
            updates.push(`can_delete_cases = $${paramIdx++}`);
            values.push(can_delete_cases);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id, employeeId);

        const result = await db.query(`
            UPDATE corporate_client_employees 
            SET ${updates.join(', ')}
            WHERE corporate_client_id = $${paramIdx++} 
            AND employee_id = $${paramIdx++}
            RETURNING *
        `, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating employee permissions:', error);
        res.status(500).json({ error: 'Failed to update permissions', details: error.message });
    }
});

/**
 * DELETE /api/corporate-clients/:id/employees/:employeeId
 * Remove an employee from a corporate client
 */
router.delete('/:id/employees/:employeeId', async (req, res) => {
    try {
        const { id, employeeId } = req.params;

        const result = await db.query(`
            DELETE FROM corporate_client_employees 
            WHERE corporate_client_id = $1 
            AND employee_id = $2
            RETURNING *
        `, [id, employeeId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }

        res.json({
            message: 'Employee removed from corporate client',
            removed_assignment: result.rows[0]
        });
    } catch (error) {
        console.error('Error removing employee from corporate client:', error);
        res.status(500).json({ error: 'Failed to remove employee', details: error.message });
    }
});

// ============================================================================
// ROUTES: Analytics
// ============================================================================

/**
 * GET /api/corporate-clients/:id/analytics
 * Get analytics for a corporate client
 */
router.get('/:id/analytics', async (req, res) => {
    try {
        const { id } = req.params;

        const caseStats = await db.query(`
            SELECT 
                case_status,
                COUNT(*) as count
            FROM legal_cases
            WHERE corporate_client_id = $1
            GROUP BY case_status
        `, [id]);

        const priorityStats = await db.query(`
            SELECT 
                priority,
                COUNT(*) as count
            FROM legal_cases
            WHERE corporate_client_id = $1
            GROUP BY priority
        `, [id]);

        const overallStats = await db.query(`
            SELECT 
                COUNT(*) as total_cases,
                COUNT(CASE WHEN case_status = 'active' THEN 1 END) as active_cases,
                COUNT(CASE WHEN case_status = 'closed' THEN 1 END) as closed_cases,
                COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent_cases,
                COUNT(CASE WHEN next_deadline IS NOT NULL AND next_deadline <= CURRENT_DATE THEN 1 END) as overdue_cases
            FROM legal_cases
            WHERE corporate_client_id = $1
        `, [id]);

        res.json({
            overall_stats: overallStats.rows[0],
            case_status_breakdown: caseStats.rows,
            priority_breakdown: priorityStats.rows
        });
    } catch (error) {
        console.error('Error fetching corporate analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics', details: error.message });
    }
});

module.exports = router;
