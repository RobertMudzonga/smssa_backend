/**
 * Legal Projects Routes
 * 
 * API endpoints for the Legal Projects module.
 * Handles CRUD operations and workflow state transitions for:
 * - Overstay Appeal cases
 * - Prohibited Persons (V-list) cases  
 * - High Court/Expedition cases
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { createNotification } = require('../lib/notifications');

// ============================================================================
// CONSTANTS
// ============================================================================

const CASE_TYPES = ['overstay_appeal', 'prohibited_persons', 'high_court_expedition', 'appeals_8_4', 'appeals_8_6'];
const CASE_STATUSES = ['active', 'closed', 'lost', 'settled', 'appealing', 'on_hold'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const STEP_NAMES = {
    overstay_appeal: {
        1: 'Reach Out to Client',
        2: 'Prepare Application (Drafting)',
        3: 'Submit Application',
        4: 'Follow ups with DHA',
        5: 'Outcome'
    },
    prohibited_persons: {
        1: 'Reach Out to Client',
        2: 'Prepare Application (Drafting)',
        3: 'Submission',
        4: 'Follow ups with DHA',
        5: 'Outcome'
    },
    high_court_expedition: {
        1: 'Letter of Demand',
        2: 'Founding Affidavit (Drafting)',
        3: 'Commissioner of Oaths',
        4: 'Issuing at the High Court',
        5: 'Sheriff',
        6: 'Return of Service',
        7: 'Settlement / Agreement',
        8: 'High Court',
        9: 'Complete'
    },
    appeals_8_4: {
        1: 'Reach Out to Clients',
        2: 'Prepare Appeal Draft',
        3: 'Appointment Booked',
        4: 'Submit Application at VFS Center',
        5: 'Track the Application',
        6: 'Outcome'
    },
    appeals_8_6: {
        1: 'Reach Out to Clients',
        2: 'Prepare Appeal Draft',
        3: 'Appointment Booked',
        4: 'Submit Application at VFS Center',
        5: 'Track the Application',
        6: 'Outcome'
    }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique case reference
 */
function generateCaseReference(caseType) {
    const prefix = {
        'overstay_appeal': 'OA',
        'prohibited_persons': 'PP',
        'high_court_expedition': 'HC',
        'appeals_8_4': 'A84',
        'appeals_8_6': 'A86'
    }[caseType] || 'LC';
    
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    return `${prefix}-${year}-${random}`;
}

/**
 * Create initial step history for a case type
 */
function createInitialStepHistory(caseType) {
    const steps = STEP_NAMES[caseType] || {};
    return Object.entries(steps).map(([stepId, stepName]) => ({
        step_id: parseInt(stepId),
        step_name: stepName,
        status: parseInt(stepId) === 1 ? 'in_progress' : 'not_started',
        started_at: parseInt(stepId) === 1 ? new Date().toISOString() : null,
        completed_at: null,
        notes: null,
        performed_by: null
    }));
}

/**
 * Create default workflow data based on case type
 */
function createDefaultWorkflowData(caseType) {
    switch (caseType) {
        case 'overstay_appeal':
            return {
                type: 'overstay_appeal',
                email_submission_sent: false,
                email_submission_date: null,
                email_recipient: null,
                dha_reference_number: null,
                outcome_result: null
            };
        case 'prohibited_persons':
            return {
                type: 'prohibited_persons',
                vlist_reference: null,
                dha_reference_number: null,
                outcome_result: null,
                is_appeal: false,
                appeal_count: 0
            };
        case 'high_court_expedition':
            return {
                type: 'high_court_expedition',
                letter_of_demand_date: null,
                notification_period_start: null,
                notification_period_end: null,
                notification_period_satisfied: false,
                court_case_number: null,
                court_filing_date: null,
                sheriff_service_date: null,
                settlement_outcome: null,
                settlement_date: null,
                settlement_amount: null,
                settlement_terms: null,
                final_judgment_date: null,
                judgment_outcome: null
            };
        case 'appeals_8_4':
            return {
                type: 'appeals_8_4',
                appointment_booked_date: null,
                vfs_center: null,
                tracking_reference: null,
                outcome_result: null
            };
        case 'appeals_8_6':
            return {
                type: 'appeals_8_6',
                appointment_booked_date: null,
                vfs_center: null,
                tracking_reference: null,
                outcome_result: null
            };
        default:
            return {};
    }
}

/**
 * Log a transition for audit purposes
 */
async function logTransition(client, caseId, fromStep, toStep, fromStatus, toStatus, performedBy, actionType, notes, metadata) {
    await client.query(
        `INSERT INTO legal_case_transitions 
         (case_id, from_step, to_step, from_status, to_status, performed_by, action_type, notes, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [caseId, fromStep, toStep, fromStatus, toStatus, performedBy, actionType, notes, JSON.stringify(metadata || {})]
    );
}

// ============================================================================
// ROUTES: Basic CRUD
// ============================================================================

/**
 * GET /api/legal-cases
 * Get all legal cases with optional filtering
 */
router.get('/', async (req, res) => {
    try {
        const { 
            case_type, 
            case_status, 
            assigned_case_manager_id,
            assigned_paralegal_id,
            priority,
            search,
            has_deadline_before,
            is_overdue,
            limit = 100,
            offset = 0
        } = req.query;
        
        let query = `
            SELECT lc.*,
                   ecm.full_name AS assigned_case_manager_name,
                   ep.full_name AS assigned_paralegal_name
            FROM legal_cases lc
            LEFT JOIN employees ecm ON lc.assigned_case_manager_id = ecm.id
            LEFT JOIN employees ep ON lc.assigned_paralegal_id = ep.id
            WHERE 1=1
        `;
        const params = [];
        let paramIdx = 1;
        
        if (case_type) {
            const types = Array.isArray(case_type) ? case_type : [case_type];
            query += ` AND lc.case_type = ANY($${paramIdx++})`;
            params.push(types);
        }
        
        if (case_status) {
            const statuses = Array.isArray(case_status) ? case_status : [case_status];
            query += ` AND lc.case_status = ANY($${paramIdx++})`;
            params.push(statuses);
        }
        
        if (assigned_case_manager_id) {
            query += ` AND lc.assigned_case_manager_id = $${paramIdx++}`;
            params.push(parseInt(assigned_case_manager_id));
        }
        
        if (assigned_paralegal_id) {
            query += ` AND lc.assigned_paralegal_id = $${paramIdx++}`;
            params.push(parseInt(assigned_paralegal_id));
        }
        
        if (priority) {
            const priorities = Array.isArray(priority) ? priority : [priority];
            query += ` AND lc.priority = ANY($${paramIdx++})`;
            params.push(priorities);
        }
        
        if (search) {
            query += ` AND (lc.case_title ILIKE $${paramIdx} OR lc.case_reference ILIKE $${paramIdx} OR lc.client_name ILIKE $${paramIdx++})`;
            params.push(`%${search}%`);
        }
        
        if (has_deadline_before) {
            query += ` AND lc.next_deadline IS NOT NULL AND lc.next_deadline <= $${paramIdx++}`;
            params.push(has_deadline_before);
        }
        
        if (is_overdue === 'true') {
            query += ` AND lc.next_deadline IS NOT NULL AND lc.next_deadline < NOW()`;
        }
        
        query += ` ORDER BY 
            CASE WHEN lc.priority = 'urgent' THEN 1
                 WHEN lc.priority = 'high' THEN 2
                 WHEN lc.priority = 'medium' THEN 3
                 ELSE 4 END,
            lc.next_deadline ASC NULLS LAST,
            lc.created_at DESC
            LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await db.query(query, params);
        
        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) FROM legal_cases lc WHERE 1=1`;
        const countParams = [];
        let countIdx = 1;
        
        if (case_type) {
            const types = Array.isArray(case_type) ? case_type : [case_type];
            countQuery += ` AND lc.case_type = ANY($${countIdx++})`;
            countParams.push(types);
        }
        if (case_status) {
            const statuses = Array.isArray(case_status) ? case_status : [case_status];
            countQuery += ` AND lc.case_status = ANY($${countIdx++})`;
            countParams.push(statuses);
        }
        
        const countResult = await db.query(countQuery, countParams);
        
        res.json({
            cases: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Error fetching legal cases:', error);
        res.status(500).json({ error: 'Failed to fetch legal cases', details: error.message });
    }
});

/**
 * GET /api/legal-cases/stats
 * Get statistics dashboard data
 */
router.get('/stats', async (req, res) => {
    try {
        // Total cases by type
        const typeStats = await db.query(`
            SELECT case_type, COUNT(*) as count
            FROM legal_cases
            GROUP BY case_type
        `);
        
        // Cases by status
        const statusStats = await db.query(`
            SELECT case_status, COUNT(*) as count
            FROM legal_cases
            GROUP BY case_status
        `);
        
        // Cases by priority
        const priorityStats = await db.query(`
            SELECT priority, COUNT(*) as count
            FROM legal_cases
            GROUP BY priority
        `);
        
        // Upcoming deadlines (next 7 days)
        const upcomingDeadlines = await db.query(`
            SELECT lc.*, 
                   ecm.full_name AS assigned_case_manager_name
            FROM legal_cases lc
            LEFT JOIN employees ecm ON lc.assigned_case_manager_id = ecm.id
            WHERE lc.next_deadline IS NOT NULL 
              AND lc.next_deadline BETWEEN NOW() AND NOW() + INTERVAL '7 days'
              AND lc.case_status NOT IN ('closed', 'settled', 'lost')
            ORDER BY lc.next_deadline ASC
            LIMIT 10
        `);
        
        // Overdue cases
        const overdueCases = await db.query(`
            SELECT lc.*,
                   ecm.full_name AS assigned_case_manager_name
            FROM legal_cases lc
            LEFT JOIN employees ecm ON lc.assigned_case_manager_id = ecm.id
            WHERE lc.next_deadline IS NOT NULL 
              AND lc.next_deadline < NOW()
              AND lc.case_status NOT IN ('closed', 'settled', 'lost')
            ORDER BY lc.next_deadline ASC
        `);
        
        // Cases per case manager
        const caseManagerStats = await db.query(`
            SELECT 
                e.id AS employee_id,
                e.full_name AS case_manager_name,
                COUNT(lc.case_id) as case_count,
                COUNT(CASE WHEN lc.case_status = 'active' THEN 1 END) as active_count
            FROM employees e
            LEFT JOIN legal_cases lc ON e.id = lc.assigned_case_manager_id
            WHERE e.department = 'Legal' OR lc.case_id IS NOT NULL
            GROUP BY e.id, e.full_name
            HAVING COUNT(lc.case_id) > 0
            ORDER BY case_count DESC
        `);
        
        res.json({
            by_type: typeStats.rows.reduce((acc, r) => ({ ...acc, [r.case_type]: parseInt(r.count) }), {}),
            by_status: statusStats.rows.reduce((acc, r) => ({ ...acc, [r.case_status]: parseInt(r.count) }), {}),
            by_priority: priorityStats.rows.reduce((acc, r) => ({ ...acc, [r.priority]: parseInt(r.count) }), {}),
            upcoming_deadlines: upcomingDeadlines.rows,
            overdue_cases: overdueCases.rows,
            cases_per_case_manager: caseManagerStats.rows
        });
    } catch (error) {
        console.error('Error fetching legal case stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics', details: error.message });
    }
});

/**
 * GET /api/legal-cases/:id
 * Get a single legal case by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            SELECT lc.*,
                   ecm.full_name AS assigned_case_manager_name,
                   ep.full_name AS assigned_paralegal_name
            FROM legal_cases lc
            LEFT JOIN employees ecm ON lc.assigned_case_manager_id = ecm.id
            LEFT JOIN employees ep ON lc.assigned_paralegal_id = ep.id
            WHERE lc.case_id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        // Get appeals if it's a Prohibited Persons case
        const legalCase = result.rows[0];
        if (legalCase.case_type === 'prohibited_persons') {
            const appealsResult = await db.query(`
                SELECT * FROM legal_case_appeals 
                WHERE parent_case_id = $1 
                ORDER BY appeal_number DESC
            `, [id]);
            legalCase.appeals = appealsResult.rows;
        }
        
        // Get transition history
        const transitionsResult = await db.query(`
            SELECT t.*, e.full_name AS performer_name
            FROM legal_case_transitions t
            LEFT JOIN employees e ON t.performed_by = e.id
            WHERE t.case_id = $1
            ORDER BY t.created_at DESC
            LIMIT 50
        `, [id]);
        legalCase.transitions = transitionsResult.rows;
        
        res.json(legalCase);
    } catch (error) {
        console.error('Error fetching legal case:', error);
        res.status(500).json({ error: 'Failed to fetch legal case', details: error.message });
    }
});

/**
 * POST /api/legal-cases
 * Create a new legal case
 */
router.post('/', async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        const {
            case_type,
            case_title,
            client_name,
            client_email,
            client_phone,
            client_id,
            assigned_case_manager_id,
            assigned_paralegal_id,
            vfs_center,
            priority = 'medium',
            notes,
            tags = []
        } = req.body;
        
        // Validate case type
        if (!CASE_TYPES.includes(case_type)) {
            return res.status(400).json({ 
                error: 'Invalid case type', 
                valid_types: CASE_TYPES 
            });
        }
        
        if (!case_title || !client_name) {
            return res.status(400).json({ error: 'case_title and client_name are required' });
        }
        
        await client.query('BEGIN');
        
        const caseReference = generateCaseReference(case_type);
        const stepHistory = createInitialStepHistory(case_type);
        const workflowData = createDefaultWorkflowData(case_type);
        if ((case_type === 'appeals_8_4' || case_type === 'appeals_8_6') && vfs_center) {
            workflowData.vfs_center = vfs_center;
        }
        const currentStepName = STEP_NAMES[case_type][1];
        const now = new Date().toISOString();
        
        const result = await client.query(`
            INSERT INTO legal_cases (
                case_reference, case_type, case_title, case_status,
                client_id, client_name, client_email, client_phone,
                assigned_case_manager_id, assigned_paralegal_id,
                current_step, current_step_name, step_history, workflow_data,
                priority, notes, tags, started_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *
        `, [
            caseReference, case_type, case_title, 'active',
            client_id || null, client_name, client_email || null, client_phone || null,
            assigned_case_manager_id || null, assigned_paralegal_id || null,
            1, currentStepName, JSON.stringify(stepHistory), JSON.stringify(workflowData),
            priority, notes || null, tags, now
        ]);
        
        const newCase = result.rows[0];
        
        // Log creation transition
        await logTransition(
            client, newCase.case_id, null, 1, null, 'active',
            assigned_case_manager_id, 'create', 'Case created', { case_type }
        );
        
        // Create notification for assigned case manager
        if (assigned_case_manager_id) {
            try {
                await createNotification({
                    employee_id: assigned_case_manager_id,
                    type: 'legal_case_assigned',
                    title: `New legal case assigned: ${case_title}`,
                    message: `You have been assigned a new legal case: ${caseReference}`,
                    related_entity_type: 'legal_case',
                    related_entity_id: newCase.case_id
                });
            } catch (notifError) {
                console.error('Failed to create notification, continuing:', notifError.message);
            }
        }
        
        await client.query('COMMIT');
        
        res.status(201).json(newCase);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating legal case:', error);
        res.status(500).json({ error: 'Failed to create legal case', details: error.message });
    } finally {
        client.release();
    }
});

/**
 * PATCH /api/legal-cases/:id
 * Update a legal case
 */
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            case_title,
            client_name,
            client_email,
            client_phone,
            assigned_case_manager_id,
            assigned_paralegal_id,
            priority,
            notes,
            tags,
            case_status
        } = req.body;
        
        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramIdx = 1;
        
        if (case_title !== undefined) {
            updates.push(`case_title = $${paramIdx++}`);
            values.push(case_title);
        }
        if (client_name !== undefined) {
            updates.push(`client_name = $${paramIdx++}`);
            values.push(client_name);
        }
        if (client_email !== undefined) {
            updates.push(`client_email = $${paramIdx++}`);
            values.push(client_email);
        }
        if (client_phone !== undefined) {
            updates.push(`client_phone = $${paramIdx++}`);
            values.push(client_phone);
        }
        if (assigned_case_manager_id !== undefined) {
            updates.push(`assigned_case_manager_id = $${paramIdx++}`);
            values.push(assigned_case_manager_id);
        }
        if (assigned_paralegal_id !== undefined) {
            updates.push(`assigned_paralegal_id = $${paramIdx++}`);
            values.push(assigned_paralegal_id);
        }
        if (priority !== undefined) {
            if (!PRIORITIES.includes(priority)) {
                return res.status(400).json({ error: 'Invalid priority', valid_priorities: PRIORITIES });
            }
            updates.push(`priority = $${paramIdx++}`);
            values.push(priority);
        }
        if (notes !== undefined) {
            updates.push(`notes = $${paramIdx++}`);
            values.push(notes);
        }
        if (tags !== undefined) {
            updates.push(`tags = $${paramIdx++}`);
            values.push(tags);
        }
        if (case_status !== undefined) {
            if (!CASE_STATUSES.includes(case_status)) {
                return res.status(400).json({ error: 'Invalid status', valid_statuses: CASE_STATUSES });
            }
            updates.push(`case_status = $${paramIdx++}`);
            values.push(case_status);
            if (['closed', 'settled', 'lost'].includes(case_status)) {
                updates.push(`closed_at = $${paramIdx++}`);
                values.push(new Date().toISOString());
            }
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        values.push(id);
        
        const result = await db.query(`
            UPDATE legal_cases 
            SET ${updates.join(', ')}
            WHERE case_id = $${paramIdx}
            RETURNING *
        `, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating legal case:', error);
        res.status(500).json({ error: 'Failed to update legal case', details: error.message });
    }
});

/**
 * GET /api/legal-cases/:id/documents
 * Get all documents for a legal case
 */
router.get('/:id/documents', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verify case exists
        const caseCheck = await db.query(
            'SELECT case_id, case_reference FROM legal_cases WHERE case_id = $1',
            [id]
        );
        
        if (caseCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        const result = await db.query(`
            SELECT 
                document_id,
                name,
                mime_type,
                size,
                document_type,
                description,
                uploaded_by,
                created_at,
                expiry_date,
                unique_doc_id,
                status
            FROM documents 
            WHERE legal_case_id = $1 
            ORDER BY created_at DESC
        `, [id]);
        
        res.json({
            case_reference: caseCheck.rows[0].case_reference,
            documents: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error fetching legal case documents:', error);
        res.status(500).json({ error: 'Failed to fetch documents', details: error.message });
    }
});

/**
 * DELETE /api/legal-cases/:id
 * Delete a legal case
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(
            'DELETE FROM legal_cases WHERE case_id = $1 RETURNING case_id, case_reference',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        res.json({ success: true, deleted: result.rows[0] });
    } catch (error) {
        console.error('Error deleting legal case:', error);
        res.status(500).json({ error: 'Failed to delete legal case', details: error.message });
    }
});

// ============================================================================
// ROUTES: Workflow State Transitions
// ============================================================================

/**
 * POST /api/legal-cases/:id/advance
 * Advance a case to the next workflow step
 */
router.post('/:id/advance', async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        const { id } = req.params;
        const { notes, performed_by, attachments, metadata } = req.body;
        
        await client.query('BEGIN');
        
        // Get current case state
        const caseResult = await client.query(
            'SELECT * FROM legal_cases WHERE case_id = $1 FOR UPDATE',
            [id]
        );
        
        if (caseResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        const legalCase = caseResult.rows[0];
        const steps = STEP_NAMES[legalCase.case_type];
        const totalSteps = Object.keys(steps).length;
        
        // Validation
        if (['closed', 'settled'].includes(legalCase.case_status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cannot advance a closed or settled case' });
        }
        
        if (legalCase.current_step >= totalSteps) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Case is already at the final step' });
        }
        
        // Check High Court 14-day constraint
        if (legalCase.case_type === 'high_court_expedition' && legalCase.current_step === 1) {
            const workflowData = legalCase.workflow_data;
            if (workflowData.notification_period_end && !workflowData.notification_period_satisfied) {
                const endDate = new Date(workflowData.notification_period_end);
                if (endDate > new Date()) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ 
                        error: '14-day notification period not satisfied',
                        notification_period_end: workflowData.notification_period_end
                    });
                }
            }
        }
        
        // Check Settlement outcome requirement
        if (legalCase.case_type === 'high_court_expedition' && legalCase.current_step === 7) {
            const workflowData = legalCase.workflow_data;
            if (!workflowData.settlement_outcome) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    error: 'Settlement outcome must be set before proceeding. Use /settlement endpoint first.'
                });
            }
        }
        
        const previousStep = legalCase.current_step;
        const newStep = previousStep + 1;
        const newStepName = steps[newStep];
        const now = new Date().toISOString();
        
        // Update step history
        let stepHistory = legalCase.step_history || [];
        stepHistory = stepHistory.map(entry => {
            if (entry.step_id === previousStep) {
                return {
                    ...entry,
                    status: 'completed',
                    completed_at: now,
                    notes: notes || entry.notes,
                    performed_by: performed_by || entry.performed_by,
                    attachments: attachments || entry.attachments,
                    metadata: metadata || entry.metadata
                };
            }
            if (entry.step_id === newStep) {
                return {
                    ...entry,
                    status: 'in_progress',
                    started_at: now
                };
            }
            return entry;
        });
        
        // Special handling for High Court Letter of Demand step
        let workflowData = { ...legalCase.workflow_data };
        let constraints = legalCase.constraints || [];
        let nextDeadline = legalCase.next_deadline;
        
        if (legalCase.case_type === 'high_court_expedition' && newStep === 1 && !workflowData.notification_period_start) {
            // Starting Letter of Demand - set 14-day notification period
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 14);
            
            workflowData = {
                ...workflowData,
                letter_of_demand_date: now,
                notification_period_start: now,
                notification_period_end: endDate.toISOString()
            };
            
            constraints = [
                ...constraints,
                {
                    constraint_type: 'time_period',
                    description: '14-day notification period for Letter of Demand',
                    value: { days: 14 },
                    is_satisfied: false,
                    due_date: endDate.toISOString()
                }
            ];
            
            nextDeadline = endDate.toISOString();
        }
        
        // Update the case
        const updateResult = await client.query(`
            UPDATE legal_cases SET
                current_step = $1,
                current_step_name = $2,
                step_history = $3,
                workflow_data = $4,
                constraints = $5,
                next_deadline = $6
            WHERE case_id = $7
            RETURNING *
        `, [newStep, newStepName, JSON.stringify(stepHistory), JSON.stringify(workflowData), JSON.stringify(constraints), nextDeadline, id]);
        
        // Log the transition
        await logTransition(
            client, id, previousStep, newStep, legalCase.case_status, legalCase.case_status,
            performed_by, 'advance', notes, metadata
        );
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            case: updateResult.rows[0],
            previous_step: previousStep,
            current_step: newStep,
            message: `Advanced from step ${previousStep} to step ${newStep}: ${newStepName}`
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error advancing legal case:', error);
        res.status(500).json({ error: 'Failed to advance legal case', details: error.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/legal-cases/:id/outcome
 * Set the outcome for a case (Overstay Appeal or Prohibited Persons)
 */
router.post('/:id/outcome', async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        const { id } = req.params;
        const { outcome, notes, performed_by } = req.body;
        
        if (!outcome) {
            return res.status(400).json({ error: 'outcome is required' });
        }
        
        await client.query('BEGIN');
        
        const caseResult = await client.query(
            'SELECT * FROM legal_cases WHERE case_id = $1 FOR UPDATE',
            [id]
        );
        
        if (caseResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        const legalCase = caseResult.rows[0];
        const now = new Date().toISOString();
        let newStatus = legalCase.case_status;
        let workflowData = { ...legalCase.workflow_data };
        let closedAt = null;
        
        // Handle based on case type
        if (legalCase.case_type === 'overstay_appeal' || legalCase.case_type === 'appeals_8_4' || legalCase.case_type === 'appeals_8_6') {
            const validOutcomes = ['approved', 'rejected', 'pending'];
            if (!validOutcomes.includes(outcome)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Invalid outcome for this case type', valid_outcomes: validOutcomes });
            }
            
            workflowData.outcome_result = outcome;
            
            if (outcome === 'approved') {
                newStatus = 'closed';
                closedAt = now;
            } else if (outcome === 'rejected') {
                newStatus = 'lost';
                closedAt = now;
            }
        }
        else if (legalCase.case_type === 'prohibited_persons') {
            const validOutcomes = ['success', 'lost'];
            if (!validOutcomes.includes(outcome)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Invalid outcome for Prohibited Persons', valid_outcomes: validOutcomes });
            }
            
            workflowData.outcome_result = outcome;
            
            if (outcome === 'success') {
                newStatus = 'closed';
                closedAt = now;
            } else {
                newStatus = 'lost';
                closedAt = now;
            }
        }
        else {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Outcome endpoint only applies to outcome-based case types' });
        }
        
        // Update step history
        let stepHistory = legalCase.step_history || [];
        const outcomeStep = (legalCase.case_type === 'appeals_8_4' || legalCase.case_type === 'appeals_8_6') ? 6 : 5;
        stepHistory = stepHistory.map(entry => {
            if (entry.step_id === outcomeStep) {
                return {
                    ...entry,
                    status: 'completed',
                    completed_at: now,
                    notes: notes || entry.notes,
                    performed_by: performed_by || entry.performed_by
                };
            }
            return entry;
        });
        
        const updateResult = await client.query(`
            UPDATE legal_cases SET
                case_status = $1,
                workflow_data = $2,
                step_history = $3,
                closed_at = $4
            WHERE case_id = $5
            RETURNING *
        `, [newStatus, JSON.stringify(workflowData), JSON.stringify(stepHistory), closedAt, id]);
        
        // Log transition
        await logTransition(
            client, id, legalCase.current_step, legalCase.current_step,
            legalCase.case_status, newStatus, performed_by, 'outcome_set', notes, { outcome }
        );
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            case: updateResult.rows[0],
            outcome: outcome,
            message: `Case outcome set to: ${outcome}`,
            next_actions: outcome === 'lost' && legalCase.case_type === 'prohibited_persons'
                ? ['Consider triggering an appeal using POST /api/legal-cases/:id/appeal']
                : []
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error setting case outcome:', error);
        res.status(500).json({ error: 'Failed to set case outcome', details: error.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/legal-cases/:id/appeal
 * Trigger an appeal for a Lost Prohibited Persons case (creates linked sub-case)
 */
router.post('/:id/appeal', async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        const { id } = req.params;
        const { notes, performed_by } = req.body;
        
        await client.query('BEGIN');
        
        const caseResult = await client.query(
            'SELECT * FROM legal_cases WHERE case_id = $1 FOR UPDATE',
            [id]
        );
        
        if (caseResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        const legalCase = caseResult.rows[0];
        
        // Validate case type and status
        if (legalCase.case_type !== 'prohibited_persons') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Appeals only apply to Prohibited Persons (V-list) cases' });
        }
        
        if (legalCase.workflow_data.outcome_result !== 'lost') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Appeals can only be triggered for cases with Lost outcome' });
        }
        
        const now = new Date().toISOString();
        const appealNumber = (legalCase.appeal_count || 0) + 1;
        const appealReference = `${legalCase.case_reference}-APPEAL-${appealNumber}`;
        
        // Create new appeal case
        const appealStepHistory = createInitialStepHistory('prohibited_persons');
        const appealWorkflowData = {
            ...createDefaultWorkflowData('prohibited_persons'),
            is_appeal: true,
            appeal_count: appealNumber,
            vlist_reference: legalCase.workflow_data.vlist_reference
        };
        
        const appealResult = await client.query(`
            INSERT INTO legal_cases (
                case_reference, case_type, case_title, case_status,
                client_id, client_name, client_email, client_phone,
                assigned_case_manager_id, assigned_paralegal_id,
                current_step, current_step_name, step_history, workflow_data,
                priority, notes, tags, started_at, parent_case_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *
        `, [
            appealReference,
            'prohibited_persons',
            `${legalCase.case_title} (Appeal #${appealNumber})`,
            'active',
            legalCase.client_id,
            legalCase.client_name,
            legalCase.client_email,
            legalCase.client_phone,
            legalCase.assigned_case_manager_id,
            legalCase.assigned_paralegal_id,
            1,
            STEP_NAMES['prohibited_persons'][1],
            JSON.stringify(appealStepHistory),
            JSON.stringify(appealWorkflowData),
            legalCase.priority,
            `Appeal of case ${legalCase.case_reference}. ${notes || ''}`,
            legalCase.tags,
            now,
            id
        ]);
        
        const appealCase = appealResult.rows[0];
        
        // Create appeal record
        await client.query(`
            INSERT INTO legal_case_appeals (parent_case_id, child_case_id, appeal_number, notes)
            VALUES ($1, $2, $3, $4)
        `, [id, appealCase.case_id, appealNumber, notes]);
        
        // Update original case
        await client.query(`
            UPDATE legal_cases SET
                case_status = 'appealing',
                appeal_count = $1
            WHERE case_id = $2
        `, [appealNumber, id]);
        
        // Log transitions
        await logTransition(
            client, id, legalCase.current_step, legalCase.current_step,
            legalCase.case_status, 'appealing', performed_by, 'appeal_triggered',
            notes, { appeal_number: appealNumber, appeal_case_id: appealCase.case_id }
        );
        
        await logTransition(
            client, appealCase.case_id, null, 1, null, 'active',
            performed_by, 'create', `Appeal #${appealNumber} created from case ${legalCase.case_reference}`,
            { parent_case_id: id }
        );
        
        // Notify case manager
        if (legalCase.assigned_case_manager_id) {
            await createNotification(
                legalCase.assigned_case_manager_id,
                'legal_appeal_created',
                `Appeal #${appealNumber} created for case ${legalCase.case_reference}`,
                { case_id: appealCase.case_id, parent_case_id: id }
            );
        }
        
        await client.query('COMMIT');
        
        res.status(201).json({
            success: true,
            message: `Appeal #${appealNumber} triggered. New case created starting from Step 1.`,
            original_case_id: id,
            appeal_case: appealCase,
            appeal_number: appealNumber
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error triggering appeal:', error);
        res.status(500).json({ error: 'Failed to trigger appeal', details: error.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/legal-cases/:id/settlement
 * Set settlement outcome for High Court case
 */
router.post('/:id/settlement', async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        const { id } = req.params;
        const { settlement_outcome, settlement_amount, settlement_terms, notes, performed_by } = req.body;
        
        if (!settlement_outcome || !['settled', 'not_settled'].includes(settlement_outcome)) {
            return res.status(400).json({ 
                error: 'settlement_outcome is required and must be "settled" or "not_settled"'
            });
        }
        
        await client.query('BEGIN');
        
        const caseResult = await client.query(
            'SELECT * FROM legal_cases WHERE case_id = $1 FOR UPDATE',
            [id]
        );
        
        if (caseResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        const legalCase = caseResult.rows[0];
        
        if (legalCase.case_type !== 'high_court_expedition') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Settlement endpoint only applies to High Court/Expedition cases' });
        }
        
        if (legalCase.current_step !== 7) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Settlement can only be set at step 7 (Settlement/Agreement)',
                current_step: legalCase.current_step
            });
        }
        
        const now = new Date().toISOString();
        let newStatus = legalCase.case_status;
        let newStep = legalCase.current_step;
        let closedAt = null;
        
        // Update workflow data
        let workflowData = {
            ...legalCase.workflow_data,
            settlement_outcome: settlement_outcome,
            settlement_date: now,
            settlement_amount: settlement_amount || null,
            settlement_terms: settlement_terms || null
        };
        
        // Update step history
        let stepHistory = legalCase.step_history || [];
        
        if (settlement_outcome === 'settled') {
            // Case ends here
            newStatus = 'settled';
            closedAt = now;
            
            stepHistory = stepHistory.map(entry => {
                if (entry.step_id === 7) {
                    return { ...entry, status: 'completed', completed_at: now, notes: notes || entry.notes, performed_by };
                }
                if (entry.step_id > 7) {
                    return { ...entry, status: 'skipped' };
                }
                return entry;
            });
        } else {
            // Proceed to High Court (step 8)
            newStep = 8;
            
            stepHistory = stepHistory.map(entry => {
                if (entry.step_id === 7) {
                    return { ...entry, status: 'completed', completed_at: now, notes: notes || entry.notes, performed_by };
                }
                if (entry.step_id === 8) {
                    return { ...entry, status: 'in_progress', started_at: now };
                }
                return entry;
            });
        }
        
        const updateResult = await client.query(`
            UPDATE legal_cases SET
                case_status = $1,
                current_step = $2,
                current_step_name = $3,
                workflow_data = $4,
                step_history = $5,
                closed_at = $6
            WHERE case_id = $7
            RETURNING *
        `, [
            newStatus,
            newStep,
            STEP_NAMES['high_court_expedition'][newStep],
            JSON.stringify(workflowData),
            JSON.stringify(stepHistory),
            closedAt,
            id
        ]);
        
        // Log transition
        await logTransition(
            client, id, 7, newStep, legalCase.case_status, newStatus,
            performed_by, 'settlement', notes, { settlement_outcome, settlement_amount }
        );
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            case: updateResult.rows[0],
            settlement_outcome: settlement_outcome,
            message: settlement_outcome === 'settled'
                ? 'Case settled - process complete'
                : 'No settlement - proceeding to High Court (step 8)',
            next_step: settlement_outcome === 'not_settled' ? 8 : null
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error setting settlement:', error);
        res.status(500).json({ error: 'Failed to set settlement', details: error.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/legal-cases/:id/complete
 * Mark a High Court case as complete after judgment
 */
router.post('/:id/complete', async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        const { id } = req.params;
        const { judgment_outcome, notes, performed_by } = req.body;
        
        if (!judgment_outcome) {
            return res.status(400).json({ error: 'judgment_outcome is required' });
        }
        
        await client.query('BEGIN');
        
        const caseResult = await client.query(
            'SELECT * FROM legal_cases WHERE case_id = $1 FOR UPDATE',
            [id]
        );
        
        if (caseResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        const legalCase = caseResult.rows[0];
        
        if (legalCase.case_type !== 'high_court_expedition') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Complete endpoint only applies to High Court/Expedition cases' });
        }
        
        if (legalCase.current_step !== 8) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Case must be at High Court step (step 8) to complete',
                current_step: legalCase.current_step
            });
        }
        
        const now = new Date().toISOString();
        
        // Update workflow data
        let workflowData = {
            ...legalCase.workflow_data,
            final_judgment_date: now,
            judgment_outcome: judgment_outcome
        };
        
        // Update step history
        let stepHistory = legalCase.step_history || [];
        stepHistory = stepHistory.map(entry => {
            if (entry.step_id === 8) {
                return { ...entry, status: 'completed', completed_at: now, notes: notes || entry.notes, performed_by };
            }
            if (entry.step_id === 9) {
                return { ...entry, status: 'completed', started_at: now, completed_at: now, notes: `Judgment: ${judgment_outcome}` };
            }
            return entry;
        });
        
        const updateResult = await client.query(`
            UPDATE legal_cases SET
                case_status = 'closed',
                current_step = 9,
                current_step_name = $1,
                workflow_data = $2,
                step_history = $3,
                closed_at = $4
            WHERE case_id = $5
            RETURNING *
        `, [
            STEP_NAMES['high_court_expedition'][9],
            JSON.stringify(workflowData),
            JSON.stringify(stepHistory),
            now,
            id
        ]);
        
        // Log transition
        await logTransition(
            client, id, 8, 9, legalCase.case_status, 'closed',
            performed_by, 'complete', notes, { judgment_outcome }
        );
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            case: updateResult.rows[0],
            judgment_outcome: judgment_outcome,
            message: `High Court case completed with judgment: ${judgment_outcome}`
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error completing case:', error);
        res.status(500).json({ error: 'Failed to complete case', details: error.message });
    } finally {
        client.release();
    }
});

/**
 * POST /api/legal-cases/:id/email-submission
 * Record email submission for Overstay Appeal case
 */
router.post('/:id/email-submission', async (req, res) => {
    try {
        const { id } = req.params;
        const { email_recipient, dha_reference, notes, performed_by } = req.body;
        
        if (!email_recipient) {
            return res.status(400).json({ error: 'email_recipient is required' });
        }
        
        const caseResult = await db.query('SELECT * FROM legal_cases WHERE case_id = $1', [id]);
        
        if (caseResult.rows.length === 0) {
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        const legalCase = caseResult.rows[0];
        
        if (legalCase.case_type !== 'overstay_appeal') {
            return res.status(400).json({ error: 'Email submission only applies to Overstay Appeal cases' });
        }
        
        const now = new Date().toISOString();
        const workflowData = {
            ...legalCase.workflow_data,
            email_submission_sent: true,
            email_submission_date: now,
            email_recipient: email_recipient,
            dha_reference_number: dha_reference || null
        };
        
        const updateResult = await db.query(`
            UPDATE legal_cases SET workflow_data = $1 WHERE case_id = $2 RETURNING *
        `, [JSON.stringify(workflowData), id]);
        
        res.json({
            success: true,
            case: updateResult.rows[0],
            message: 'Email submission recorded successfully'
        });
    } catch (error) {
        console.error('Error recording email submission:', error);
        res.status(500).json({ error: 'Failed to record email submission', details: error.message });
    }
});

/**
 * POST /api/legal-cases/:id/satisfy-notification-period
 * Manually mark 14-day notification period as satisfied for High Court case
 */
router.post('/:id/satisfy-notification-period', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes, performed_by } = req.body;
        
        const caseResult = await db.query('SELECT * FROM legal_cases WHERE case_id = $1', [id]);
        
        if (caseResult.rows.length === 0) {
            return res.status(404).json({ error: 'Legal case not found' });
        }
        
        const legalCase = caseResult.rows[0];
        
        if (legalCase.case_type !== 'high_court_expedition') {
            return res.status(400).json({ error: 'Notification period only applies to High Court cases' });
        }
        
        const workflowData = {
            ...legalCase.workflow_data,
            notification_period_satisfied: true
        };
        
        const constraints = (legalCase.constraints || []).map(c => {
            if (c.constraint_type === 'time_period' && c.description.includes('14-day')) {
                return { ...c, is_satisfied: true };
            }
            return c;
        });
        
        const updateResult = await db.query(`
            UPDATE legal_cases SET workflow_data = $1, constraints = $2 WHERE case_id = $3 RETURNING *
        `, [JSON.stringify(workflowData), JSON.stringify(constraints), id]);
        
        res.json({
            success: true,
            case: updateResult.rows[0],
            message: '14-day notification period marked as satisfied'
        });
    } catch (error) {
        console.error('Error satisfying notification period:', error);
        res.status(500).json({ error: 'Failed to satisfy notification period', details: error.message });
    }
});

/**
 * GET /api/legal-cases/:id/transitions
 * Get transition history for a case
 */
router.get('/:id/transitions', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await db.query(`
            SELECT t.*, e.full_name AS performer_name
            FROM legal_case_transitions t
            LEFT JOIN employees e ON t.performed_by = e.id
            WHERE t.case_id = $1
            ORDER BY t.created_at DESC
        `, [id]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching transitions:', error);
        res.status(500).json({ error: 'Failed to fetch transitions', details: error.message });
    }
});

module.exports = router;
