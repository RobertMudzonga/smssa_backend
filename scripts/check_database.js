const db = require('../db');

async function checkDatabase() {
    try {
        console.log('Checking users...');
        const users = await db.query('SELECT user_id as id, email FROM users LIMIT 5');
        console.log('Users found:', users.rows.length);
        users.rows.forEach(u => console.log(`  - ${u.email} (id: ${u.id})`));
        
        console.log('\nChecking employees...');
        const employees = await db.query('SELECT id, full_name, work_email, role FROM employees WHERE is_active = TRUE LIMIT 5');
        console.log('Employees found:', employees.rows.length);
        employees.rows.forEach(e => console.log(`  - ${e.full_name} (${e.work_email}, role: ${e.role})`));
        
        console.log('\nChecking notifications...');
        const notifications = await db.query('SELECT notification_id, employee_id, type, title, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 5');
        console.log('Notifications found:', notifications.rows.length);
        notifications.rows.forEach(n => console.log(`  - ${n.title} (employee: ${n.employee_id}, read: ${n.is_read})`));
        
        await db.pool.end();
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

checkDatabase();
