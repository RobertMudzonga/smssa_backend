const db = require('../db');

async function testConnection() {
    console.log('Testing database connection...\n');

    try {
        // Test connection
        const result = await db.query('SELECT NOW()');
        console.log('✓ Database connection successful!');
        console.log('Current time from database:', result.rows[0].now);

        // Check if prospects table exists
        const tableCheck = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'prospects'
            ORDER BY ordinal_position
        `);

        if (tableCheck.rows.length > 0) {
            console.log('\n✓ Prospects table exists with columns:');
            tableCheck.rows.forEach(col => {
                console.log(`  - ${col.column_name}: ${col.data_type}`);
            });
        } else {
            console.log('\n✗ Prospects table does not exist!');
            console.log('Please run migrations: node scripts/run_migrations.js');
        }

        // Check if leads table exists
        const leadsCheck = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'leads'
            ORDER BY ordinal_position
        `);

        if (leadsCheck.rows.length > 0) {
            console.log('\n✓ Leads table exists with columns:');
            leadsCheck.rows.forEach(col => {
                console.log(`  - ${col.column_name}: ${col.data_type}`);
            });
        } else {
            console.log('\n✗ Leads table does not exist!');
        }

        // Check if prospect_stages table exists
        const stagesCheck = await db.query(`
            SELECT stage_id, name 
            FROM prospect_stages 
            ORDER BY stage_id
            LIMIT 5
        `);

        if (stagesCheck.rows.length > 0) {
            console.log('\n✓ Prospect stages table exists with stages:');
            stagesCheck.rows.forEach(stage => {
                console.log(`  - ${stage.stage_id}: ${stage.name}`);
            });
        } else {
            console.log('\n✗ Prospect stages table is empty or does not exist!');
        }

        process.exit(0);
    } catch (error) {
        console.error('\n✗ Error:', error.message);
        console.error('Error code:', error.code);
        process.exit(1);
    }
}

testConnection();
