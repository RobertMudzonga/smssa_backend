const db = require('../db');

/**
 * Get all managers (overall_manager and department_manager roles)
 * @returns {Promise<Array>} Array of manager employee IDs
 */
async function getManagers() {
    try {
        const result = await db.query(`
            SELECT id, full_name, role, department
            FROM employees
            WHERE role IN ('overall_manager', 'department_manager')
            AND is_active = TRUE
        `);
        return result.rows;
    } catch (err) {
        console.error('Error fetching managers:', err);
        return [];
    }
}

/**
 * Get managers by department
 * @param {string} department - Department name
 * @returns {Promise<Array>} Array of manager employee IDs in that department
 */
async function getManagersByDepartment(department) {
    try {
        const result = await db.query(`
            SELECT id, full_name, role
            FROM employees
            WHERE role IN ('overall_manager', 'department_manager')
            AND (department = $1 OR role = 'overall_manager')
            AND is_active = TRUE
        `, [department]);
        return result.rows;
    } catch (err) {
        console.error('Error fetching managers by department:', err);
        return [];
    }
}

/**
 * Get employees with specific role
 * @param {string} role - Role name (e.g., 'accountant')
 * @returns {Promise<Array>} Array of employee records
 */
async function getEmployeesByRole(role) {
    try {
        const result = await db.query(`
            SELECT id, full_name, role, department
            FROM employees
            WHERE role = $1
            AND is_active = TRUE
        `, [role]);
        return result.rows;
    } catch (err) {
        console.error('Error fetching employees by role:', err);
        return [];
    }
}

/**
 * Create a notification for an employee
 * @param {Object} params - Notification parameters
 * @param {number} params.employee_id - Target employee ID
 * @param {string} params.type - Notification type
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {string} params.related_entity_type - Related entity type (optional)
 * @param {number} params.related_entity_id - Related entity ID (optional)
 * @returns {Promise<Object>} Created notification
 */
async function createNotification({ employee_id, type, title, message, related_entity_type, related_entity_id }) {
    try {
        const result = await db.query(
            `INSERT INTO notifications (
                employee_id, type, title, message,
                related_entity_type, related_entity_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            RETURNING *`,
            [employee_id, type, title, message, related_entity_type || null, related_entity_id || null]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating notification:', err);
        throw err;
    }
}

/**
 * Create notifications for multiple employees
 * @param {Array<number>} employee_ids - Array of employee IDs
 * @param {Object} notificationData - Notification data
 * @param {string} notificationData.type - Notification type
 * @param {string} notificationData.title - Notification title
 * @param {string} notificationData.message - Notification message
 * @param {string} notificationData.related_entity_type - Related entity type (optional)
 * @param {number} notificationData.related_entity_id - Related entity ID (optional)
 * @returns {Promise<Array>} Array of created notifications
 */
async function notifyMultiple(employee_ids, notificationData) {
    const notifications = [];
    
    for (const employee_id of employee_ids) {
        try {
            const notification = await createNotification({
                employee_id,
                ...notificationData
            });
            notifications.push(notification);
        } catch (err) {
            console.error(`Error notifying employee ${employee_id}:`, err);
            // Continue with other notifications even if one fails
        }
    }
    
    return notifications;
}

/**
 * Notify all managers about an event
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Array>} Array of created notifications
 */
async function notifyManagers(notificationData) {
    const managers = await getManagers();
    const managerIds = managers.map(m => m.id);
    return notifyMultiple(managerIds, notificationData);
}

/**
 * Notify managers of a specific department
 * @param {string} department - Department name
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Array>} Array of created notifications
 */
async function notifyDepartmentManagers(department, notificationData) {
    const managers = await getManagersByDepartment(department);
    const managerIds = managers.map(m => m.id);
    return notifyMultiple(managerIds, notificationData);
}

module.exports = {
    getManagers,
    getManagersByDepartment,
    getEmployeesByRole,
    createNotification,
    notifyMultiple,
    notifyManagers,
    notifyDepartmentManagers
};
