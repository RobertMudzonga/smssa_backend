const { Pool } = require('pg');
require('dotenv').config();

// --- Configuration ---

// Use the standard DATABASE_URL environment variable.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set.');
}

// Default SSL configuration for common cloud environments (e.g., Heroku, Render).
// If your environment requires non-standard SSL settings, you might need to
// modify this object. This typically ensures connection is secure.
let poolConfig = {
    connectionString: connectionString,
    ssl: {
        // Required for cloud providers that use self-signed certificates
        // or where the client cannot verify the host's certificate.
        rejectUnauthorized: process.env.NODE_ENV === 'production' ? false : true,
    }
};

// If the environment is not 'production', or if SSL is explicitly disabled,
// we can remove the SSL object. This is a common pattern for local development.
if (process.env.DB_SSL === 'false' || process.env.NODE_ENV !== 'production') {
    poolConfig.ssl = false;
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