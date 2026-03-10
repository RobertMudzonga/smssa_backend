/**
 * Notification System Test Script
 * 
 * This script tests the notification helper functions to ensure they work correctly.
 * Run with: node scripts/test_notifications.js
 */

const db = require('../db');
const {
    getManagers,
    getManagersByDepartment,
    getEmployeesByRole,
    createNotification,
    notifyManagers,
    notifyDepartmentManagers
} = require('../lib/notifications');

async function testNotificationSystem() {
    console.log('=== Testing Notification System ===\n');

    try {
        // Test 1: Get all managers
        console.log('Test 1: Getting all managers...');
        const managers = await getManagers();
        console.log(`Found ${managers.length} managers:`);
        managers.forEach(m => console.log(`  - ${m.full_name} (${m.role}, ${m.department})`));
        console.log();

        // Test 2: Get managers by department
        console.log('Test 2: Getting Sales department managers...');
        const salesManagers = await getManagersByDepartment('Sales');
        console.log(`Found ${salesManagers.length} sales managers:`);
        salesManagers.forEach(m => console.log(`  - ${m.full_name} (${m.role})`));
        console.log();

        // Test 3: Get employees by role
        console.log('Test 3: Getting accountants...');
        const accountants = await getEmployeesByRole('accountant');
        console.log(`Found ${accountants.length} accountants:`);
        accountants.forEach(a => console.log(`  - ${a.full_name} (${a.department})`));
        console.log();

        // Test 4: Create a test notification
        if (managers.length > 0) {
            console.log('Test 4: Creating a test notification...');
            const testNotification = await createNotification({
                employee_id: managers[0].id,
                type: 'test_notification',
                title: 'Test Notification',
                message: 'This is a test notification from the notification system test script.',
                related_entity_type: 'test',
                related_entity_id: 999
            });
            console.log('Test notification created:', testNotification);
            console.log();

            // Clean up test notification
            await db.query('DELETE FROM notifications WHERE notification_id = $1', [testNotification.notification_id]);
            console.log('Test notification cleaned up.');
        }

        // Test 5: Get notification counts
        console.log('\nTest 5: Checking notification counts...');
        const notifCounts = await db.query(`
            SELECT 
                e.full_name,
                COUNT(n.notification_id) as total_notifications,
                COUNT(CASE WHEN n.is_read = FALSE THEN 1 END) as unread_notifications
            FROM employees e
            LEFT JOIN notifications n ON e.id = n.employee_id
            WHERE e.is_active = TRUE
            GROUP BY e.id, e.full_name
            HAVING COUNT(n.notification_id) > 0
            ORDER BY unread_notifications DESC, total_notifications DESC
            LIMIT 10
        `);
        
        console.log('\nTop 10 employees with notifications:');
        notifCounts.rows.forEach(row => {
            console.log(`  ${row.full_name}: ${row.unread_notifications} unread / ${row.total_notifications} total`);
        });

        console.log('\n=== All Tests Completed Successfully ===');
    } catch (err) {
        console.error('Test failed with error:', err);
        process.exit(1);
    } finally {
        await db.pool.end();
    }
}

// Run tests
testNotificationSystem();
