const { Pool } = require('pg');

// Load local .env only when not in production so deployed environments
// (Render, Heroku, etc.) use their configured env vars instead of the
// repository .env file which may disable SSL unintentionally.
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

// --- Configuration ---

// Use the standard DATABASE_URL environment variable.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set.');
}

// Default SSL configuration for common cloud environments (e.g., Heroku, Render).
// If your environment requires non-standard SSL settings, you might need to
// modify this object. This typically ensures connection is secure.
// Build pool configuration and handle SSL explicitly. In production we enable
// SSL with `rejectUnauthorized: false` (common for managed Postgres providers)
// unless `DB_SSL` is explicitly set to the string 'false'. For local
// development we default to no SSL unless `DB_SSL` is 'true'.
const poolConfig = { connectionString };

if (process.env.NODE_ENV === 'production') {
    // In production, enable SSL but allow self-signed certs (rejectUnauthorized: false)
    // This matches behavior required by many PaaS Postgres providers.
    if (process.env.DB_SSL === 'false') {
        poolConfig.ssl = false;
    } else {
        poolConfig.ssl = { rejectUnauthorized: false };
    }
} else {
    // Non-production: allow opt-in via DB_SSL='true' otherwise disable SSL
    if (process.env.DB_SSL === 'true') {
        poolConfig.ssl = { rejectUnauthorized: false };
    } else {
        poolConfig.ssl = false;
    }
}


// Create a connection pool using the connection string and configuration
const pool = new Pool(poolConfig);

// --- Error Handling and Query Functions ---

// Handle pool errors
pool.on('error', (err, client) => {
    // Log pool errors but do not crash the entire process immediately.
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
    pool, // Export pool for transaction support
};