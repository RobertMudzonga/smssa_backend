const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function testProspectsQuery() {
    const client = await pool.connect();
    try {
        console.log('Testing prospects query...\n');
        
        const result = await client.query(`
            SELECT 
                p.*,
                ps.name as stage_name
            FROM prospects p
            LEFT JOIN prospect_stages ps ON p.current_stage_id = ps.stage_id
            ORDER BY p.created_at DESC
        `);
        
        console.log(`✅ Query successful! Found ${result.rows.length} prospects\n`);
        
        if (result.rows.length > 0) {
            console.log('Sample data:');
            result.rows.slice(0, 3).forEach((row, i) => {
                console.log(`\n${i + 1}. ${row.first_name} ${row.last_name}`);
                console.log(`   Email: ${row.email}`);
                console.log(`   Stage: ${row.stage_name || 'No stage'} (ID: ${row.current_stage_id})`);
            });
        }
        
    } catch (err) {
        console.error('❌ Query failed:');
        console.error('Message:', err.message);
        console.error('Code:', err.code);
        console.error('Detail:', err.detail);
        console.error('\nFull error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

testProspectsQuery();
