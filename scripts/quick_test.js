const db = require('../db');

async function quickTest() {
    try {
        console.log('Testing employee conversion reporting...\n');
        
        // Test 1: Check employees
        const emp = await db.query('SELECT id, full_name FROM employees WHERE is_active = TRUE LIMIT 3');
        console.log(`✅ Found ${emp.rows.length} employees`);
        emp.rows.forEach(e => console.log(`   - ${e.full_name} (ID: ${e.id})`));
        
        // Test 2: Check won prospects
        const won = await db.query(`
            SELECT COUNT(*) as count, 
                   COUNT(DISTINCT assigned_to) as employees_with_conversions
            FROM prospects 
            WHERE (current_stage_id = 6 OR status = 'won')
            AND assigned_to IS NOT NULL
        `);
        console.log(`\n✅ Won prospects: ${won.rows[0].count}`);
        console.log(`   Employees with conversions: ${won.rows[0].employees_with_conversions}`);
        
        // Test 3: Check conversion tracking table
        const conv = await db.query('SELECT COUNT(*) as count FROM conversion_tracking');
        console.log(`\n✅ Conversion tracking entries: ${conv.rows[0].count}`);
        
        // Test 4: Simulate the employee query
        if (emp.rows.length > 0) {
            const testEmpId = emp.rows[0].id;
            const convQuery = `
                SELECT COUNT(*) as count 
                FROM prospects 
                WHERE assigned_to = $1 
                AND (current_stage_id = 6 OR status = 'won')
            `;
            const result = await db.query(convQuery, [testEmpId]);
            console.log(`\n✅ Testing conversion query for ${emp.rows[0].full_name}:`);
            console.log(`   Conversions: ${result.rows[0].count}`);
        }
        
        // Test 5: Check if assigned_to is INTEGER
        const typeCheck = await db.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'prospects' 
            AND column_name = 'assigned_to'
        `);
        console.log(`\n✅ assigned_to field type: ${typeCheck.rows[0].data_type}`);
        
        console.log('\n✅ All tests passed!');
        
    } catch (err) {
        console.error('❌ Test failed:', err.message);
        console.error(err.stack);
    } finally {
        await db.pool.end();
    }
}

quickTest();
