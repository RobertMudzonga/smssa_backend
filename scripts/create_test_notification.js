const db = require('../db');

async function createTestNotification() {
    try {
        // Get Robert's employee ID (robert@immigrationspecialists.co.za)
        const employeeResult = await db.query(
            "SELECT id FROM employees WHERE work_email = 'robert@immigrationspecialists.co.za'"
        );
        
        if (employeeResult.rows.length === 0) {
            console.error('Robert not found in employees table');
            process.exit(1);
        }
        
        const robertId = employeeResult.rows[0].id;
        console.log(`Found Robert with employee_id: ${robertId}`);
        
        // Create a test notification
        const result = await db.query(
            `INSERT INTO notifications (
                employee_id, type, title, message,
                related_entity_type, related_entity_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            RETURNING *`,
            [
                robertId,
                'test_notification',
                'Test Notification',
                'This is a test notification to verify the notification system is working correctly.',
                'test',
                999
            ]
        );
        
        console.log('\nTest notification created successfully:');
        console.log(JSON.stringify(result.rows[0], null, 2));
        
        await db.pool.end();
    } catch (err) {
        console.error('Error:', err.message);
        console.error(err);
        process.exit(1);
    }
}

createTestNotification();
