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

async function checkProspectStages() {
    const client = await pool.connect();
    try {
        // Check if table exists
        const tableCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'prospect_stages'
        `);
        
        if (tableCheck.rows.length > 0) {
            console.log('✅ prospect_stages table exists\n');
            
            // Check columns
            const columns = await client.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'prospect_stages'
                ORDER BY ordinal_position
            `);
            
            console.log('Columns:');
            columns.rows.forEach(col => {
                console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
            });
            
            // Check data
            const data = await client.query('SELECT * FROM prospect_stages ORDER BY stage_id');
            console.log(`\nData (${data.rows.length} rows):`);
            data.rows.forEach(row => {
                console.log(`  ${row.stage_id}. ${row.name}`);
            });
        } else {
            console.log('❌ prospect_stages table does NOT exist');
        }
        
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkProspectStages();
