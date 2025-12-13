const { Pool } = require('pg');
require('dotenv').config();

// Determine SSL configuration based on environment
const sslConfig = process.env.DB_SSL === 'true' 
    ? { rejectUnauthorized: false } 
    : false;

// Create a connection pool using environment variables
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: sslConfig
});

// Handle pool errors
pool.on('error', (err, client) => {
    // Log pool errors but do not crash the entire process immediately.
    // Exiting silently made the server drop connections without usable logs.
    console.error('Unexpected error on idle client', err);
    // Optionally: implement reconnection/backoff or alerting here.
});

/**
 * Executes a single query against the database.
 * @param {string} text - The SQL query text.
 * @param {Array<any>} params - The parameters for the query.
 * @returns {Promise<import('pg').QueryResult<any>>}
 */
const query = (text, params) => {
    console.log('EXECUTING QUERY:', text.split('\n')[0].trim());
    return pool.query(text, params);
};

module.exports = {
    query,
    pool, // Export pool for transaction support (used in projects.js)
};