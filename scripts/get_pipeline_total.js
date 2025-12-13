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

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT COALESCE(SUM(p.quote_amount), 0) AS total_pipeline_value,
             COUNT(*) FILTER (WHERE p.quote_amount IS NOT NULL) AS deals_count
      FROM prospects p
      LEFT JOIN prospect_stages ps ON p.current_stage_id = ps.stage_id
      WHERE p.quote_amount IS NOT NULL
        AND (
          ps.name IS NULL
          OR (
            ps.name NOT ILIKE '%won%'
            AND ps.name NOT ILIKE '%closed%'
            AND ps.name NOT ILIKE '%lost%'
            AND ps.name NOT ILIKE '%archiv%'
          )
        )
    `);

    const row = rows[0] || { total_pipeline_value: 0, deals_count: 0 };
    console.log('Total pipeline value:', row.total_pipeline_value);
    console.log('Deals counted:', row.deals_count);
  } catch (err) {
    console.error('Error querying pipeline total:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
