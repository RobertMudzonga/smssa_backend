const { Pool } = require('pg');

// Load local .env only when `DATABASE_URL` is not already present. This
// avoids loading the repository `.env` on hosts (like Render) that provide
// `DATABASE_URL` but may not set NODE_ENV to 'production'. Allow forcing
// dotenv via `LOAD_DOTENV=true` when needed.
if (!process.env.DATABASE_URL && process.env.LOAD_DOTENV !== 'false') {
    require('dotenv').config();
    console.log('.env loaded because DATABASE_URL was not set');
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

// Decide SSL based on explicit DB_SSL or the target host in DATABASE_URL.
// Priority: if DB_SSL === 'false' -> disable. Else if DB_SSL === 'true' -> enable.
// Otherwise, if DATABASE_URL points to a non-local host, enable SSL by default
// (useful when running locally but connecting to hosted DBs like Render Postgres).
try {
    if (process.env.DB_SSL === 'false') {
        poolConfig.ssl = false;
    } else if (process.env.DB_SSL === 'true') {
        poolConfig.ssl = { rejectUnauthorized: false };
    } else {
        // Infer from the connection string host
        const parsed = new URL(connectionString);
        const host = parsed.hostname;
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
            poolConfig.ssl = { rejectUnauthorized: false };
        } else {
            poolConfig.ssl = false;
        }
    }
} catch (e) {
    // If parsing fails for any reason, fall back to non-SSL unless explicitly set.
    if (process.env.DB_SSL === 'true') {
        poolConfig.ssl = { rejectUnauthorized: false };
    } else {
        poolConfig.ssl = false;
    }
}
// Log effective SSL decision (non-secret) to help debugging on hosts.
try {
    const sslEnabled = !!poolConfig.ssl && poolConfig.ssl !== false;
    console.log(`DB SSL enabled: ${sslEnabled}`);
} catch (e) {}


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