const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/notifications - Get all notifications for an employee
// Query params: employee_id (required), unread_only (optional boolean)
router.get('/', async (req, res) => {
    const { employee_id, unread_only } = req.query;
    
    if (!employee_id) {
        return res.status(400).json({ error: 'employee_id is required' });
    }
    
    try {
        let query = `
            SELECT 
                n.*,
                e.full_name as employee_name
            FROM notifications n
            LEFT JOIN employees e ON n.employee_id = e.id
            WHERE n.employee_id = $1
        `;
        
        const params = [employee_id];
        
        if (unread_only === 'true') {
            query += ` AND n.is_read = FALSE`;
        }
        
        query += ` ORDER BY n.created_at DESC`;
        
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: 'Failed to fetch notifications', detail: err.message });
    }
});

// GET /api/notifications/unread-count - Get count of unread notifications
router.get('/unread-count', async (req, res) => {
    const { employee_id } = req.query;
    
    if (!employee_id) {
        return res.status(400).json({ error: 'employee_id is required' });
    }
    
    try {
        const result = await db.query(
            `SELECT COUNT(*) as count FROM notifications WHERE employee_id = $1 AND is_read = FALSE`,
            [employee_id]
        );
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) {
        console.error('Error fetching unread count:', err);
        res.status(500).json({ error: 'Failed to fetch unread count', detail: err.message });
    }
});

// POST /api/notifications - Create a new notification
router.post('/', async (req, res) => {
    const { 
        employee_id, 
        type, 
        title, 
        message, 
        related_entity_type, 
        related_entity_id 
    } = req.body;
    
    if (!employee_id || !type || !title || !message) {
        return res.status(400).json({ 
            error: 'employee_id, type, title, and message are required' 
        });
    }
    
    try {
        const result = await db.query(
            `INSERT INTO notifications (
                employee_id, type, title, message, 
                related_entity_type, related_entity_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) 
            RETURNING *`,
            [employee_id, type, title, message, related_entity_type || null, related_entity_id || null]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating notification:', err);
        res.status(500).json({ error: 'Failed to create notification', detail: err.message });
    }
});

// PATCH /api/notifications/:id/read - Mark notification as read
router.patch('/:id/read', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await db.query(
            `UPDATE notifications 
            SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
            WHERE notification_id = $1 
            RETURNING *`,
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error marking notification as read:', err);
        res.status(500).json({ error: 'Failed to mark notification as read', detail: err.message });
    }
});

// PATCH /api/notifications/mark-all-read - Mark all notifications as read for an employee
router.patch('/mark-all-read', async (req, res) => {
    const { employee_id } = req.body;
    
    if (!employee_id) {
        return res.status(400).json({ error: 'employee_id is required' });
    }
    
    try {
        const result = await db.query(
            `UPDATE notifications 
            SET is_read = TRUE, read_at = CURRENT_TIMESTAMP 
            WHERE employee_id = $1 AND is_read = FALSE
            RETURNING notification_id`,
            [employee_id]
        );
        
        res.json({ 
            message: 'All notifications marked as read', 
            count: result.rows.length 
        });
    } catch (err) {
        console.error('Error marking all notifications as read:', err);
        res.status(500).json({ error: 'Failed to mark all notifications as read', detail: err.message });
    }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await db.query(
            'DELETE FROM notifications WHERE notification_id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        
        res.json({ message: 'Notification deleted successfully' });
    } catch (err) {
        console.error('Error deleting notification:', err);
        res.status(500).json({ error: 'Failed to delete notification', detail: err.message });
    }
});

module.exports = router;
