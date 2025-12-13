const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Enable CORS for frontend access (adjust origin for production)
app.use(cors({
    origin: '*', // Allows all origins for development
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));
// Parse JSON bodies from requests (essential for webhooks)
app.use(express.json());
// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---
const leadsRouter = require('./routes/leads');
const projectsRouter = require('./routes/projects');
const prospectsRouter = require('./routes/prospects');
const documentsRouter = require('./routes/documents');
const employeesRouter = require('./routes/employees');
const appraisalsRouter = require('./routes/appraisals');

// Health check and root route
app.get('/', (req, res) => {
    res.send('SMSSA Backend API Running');
});

// Main application routes
app.use('/api/leads', leadsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/prospects', prospectsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/appraisals', appraisalsRouter);


// Global Error Handler
app.use((err, req, res, next) => {
    console.error('GLOBAL ERROR HANDLER:');
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Catch uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});

// Catch unhandled rejections
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
    process.exit(1);
});

const { exec } = require('child_process');

async function runMigrationsIfEnabled() {
    const auto = process.env.AUTO_MIGRATE;
    if (auto && auto.toLowerCase() === 'false') {
        console.log('AUTO_MIGRATE=false — skipping migrations');
        return;
    }

    return new Promise((resolve, reject) => {
        console.log('Running migrations...');
        const child = exec('node migrate.js', { cwd: __dirname }, (err, stdout, stderr) => {
            if (err) {
                console.error('Migration process failed:', err);
                console.error(stderr);
                return reject(err);
            }
            if (stdout) console.log(stdout);
            if (stderr) console.error(stderr);
            console.log('Migrations finished successfully');
            resolve();
        });
        // mirror child output to this process stdout/stderr
        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);
    });
}

// Start Server (run migrations first unless disabled)
(async () => {
    try {
        await runMigrationsIfEnabled();
    } catch (err) {
        console.error('Unable to run migrations. Exiting.');
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`SMSSA Backend running on port ${PORT}`);
        console.log(`Access at http://localhost:${PORT}`);
    });
})();