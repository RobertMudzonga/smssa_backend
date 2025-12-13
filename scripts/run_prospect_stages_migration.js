const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Running prospect_stages migration...');
        
        const migrationPath = path.join(__dirname, '../migrations/003_create_prospect_stages.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        await client.query(sql);
        
        console.log('✅ Migration completed successfully!');
        
        // Verify the table was created
        const result = await client.query('SELECT * FROM prospect_stages ORDER BY stage_id');
        console.log(`\n✅ Found ${result.rows.length} prospect stages:`);
        result.rows.forEach(stage => {
            console.log(`  ${stage.stage_id}. ${stage.name}`);
        });
        
    } catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
