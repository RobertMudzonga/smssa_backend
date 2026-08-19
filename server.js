const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const cron = require('node-cron');
const { processDueReminders } = require('./lib/reminderScheduler');
const { authenticate, requireAuth } = require('./middleware/auth');
const { processVisaExpiryAlerts } = require('./lib/visaExpiryAlerts');

if (process.env.NODE_ENV !== 'production') {
	require('dotenv').config();
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// Render (and most PaaS hosts) sit behind a reverse proxy; trust the first hop
// so rate limiting and IP-based logic see the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);

app.use(
	cors({
		origin: process.env.CORS_ORIGIN || '*',
		methods: ['GET', 'POST', 'PATCH', 'DELETE'],
	})
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authenticate);

// Normalize duplicate /api/api/... paths (some frontends may prepend /api twice)
app.use((req, res, next) => {
	try {
		if (req.path && req.path.indexOf('/api/api/') === 0) {
			// rewrite the url to collapse duplicate /api prefix
			req.url = req.url.replace('/api/api/', '/api/');
		}
	} catch (e) {
		// ignore and continue
	}
	next();
});

// Routes
const leadsRouter = require('./routes/leads');
const projectsRouter = require('./routes/projects');
const prospectsRouter = require('./routes/prospects');
const documentsRouter = require('./routes/documents');
const employeesRouter = require('./routes/employees');
const appraisalsRouter = require('./routes/appraisals');
const kpisRouter = require('./routes/kpis');
const importsRouter = require('./routes/imports');
const checklistsRouter = require('./routes/checklists');
const functionsRouter = require('./routes/functions');
const templatesRouter = require('./routes/templates');
const authRouter = require('./routes/auth');
const clientPortalRouter = require('./routes/client_portal');
const corporateDashboardRouter = require('./routes/corporate_dashboard');
const corporateClientsRouter = require('./routes/corporate-clients');
const corporatePermitsRouter = require('./routes/corporate-permits');
const debugRouter = require('./routes/debug');
const paymentRequestsRouter = require('./routes/payment_requests');
const notificationsRouter = require('./routes/notifications');
const leaveRequestsRouter = require('./routes/leave_requests');
const submissionsRouter = require('./routes/submissions');
const legalCasesRouter = require('./routes/legal_cases');
const workCalendarRouter = require('./routes/work_calendar');
const employeeVisasRouter = require('./routes/employee_visas');
const visaTypesRouter = require('./routes/visa_types');

app.get('/', (req, res) => {
	res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

// /api/auth (login/signup/logout), /api/client-portal (client token+password
// auth), /api/corporate-dashboard and /api/corporate-permits (external
// corporate-client portal, authenticated via a per-corporate-client
// access_token instead of an employee login) all stay publicly mounted.
// /api/documents also stays publicly mounted because some of its routes are
// used by that same unauthenticated corporate portal (document upload) and
// by browser `window.open()` download links that can't carry a bearer
// token; auth is instead applied per-route inside routes/documents.js and
// routes/corporate-clients.js for the endpoints that are employee-only.
app.use('/api/auth', authRouter);
app.use('/api/client-portal', clientPortalRouter);
app.use('/api/corporate-dashboard', corporateDashboardRouter);
app.use('/api/corporate-permits', corporatePermitsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/legal-cases', legalCasesRouter);
app.use('/api/employee-visas', employeeVisasRouter);
app.use('/api/visa-types', requireAuth, visaTypesRouter);

app.use('/api/leads', requireAuth, leadsRouter);
app.use('/api/prospects', requireAuth, prospectsRouter);
app.use('/api/employees', requireAuth, employeesRouter);
app.use('/api/appraisals', requireAuth, appraisalsRouter);
app.use('/api/kpis', requireAuth, kpisRouter);
app.use('/api/import', requireAuth, importsRouter);
app.use('/api/checklists', requireAuth, checklistsRouter);
app.use('/api/functions', requireAuth, functionsRouter);
app.use('/api/templates', requireAuth, templatesRouter);
app.use('/api/corporate-clients', corporateClientsRouter);
app.use('/api/debug', requireAuth, debugRouter);
app.use('/api/payment-requests', requireAuth, paymentRequestsRouter);
app.use('/api/notifications', requireAuth, notificationsRouter);
app.use('/api/leave-requests', requireAuth, leaveRequestsRouter);
app.use('/api/submissions', requireAuth, submissionsRouter);
app.use('/api/work-calendar', requireAuth, workCalendarRouter);

// Global error handler
app.use((err, req, res, next) => {
	console.error(err);
	const status = err && err.status ? err.status : 500;
	const payload =
		process.env.NODE_ENV === 'production'
			? { error: 'Internal Server Error' }
			: { error: err.message || 'Internal Server Error', stack: err.stack };
	res.status(status).json(payload);
});

process.on('uncaughtException', (err) => {
	console.error('Uncaught Exception:', err);
	setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason) => {
	console.error('Unhandled Rejection:', reason);
	setTimeout(() => process.exit(1), 100);
});

async function runMigrationsIfEnabled() {
	const auto = String(process.env.AUTO_MIGRATE || '').toLowerCase();
	if (auto === 'false' || auto === '0') {
		console.log('AUTO_MIGRATE disabled; skipping migrations');
		return;
	}

	return new Promise((resolve, reject) => {
		console.log('Running migrations...');
		const child = exec('node migrate.js', { cwd: __dirname }, (err, stdout, stderr) => {
			if (err) {
				console.error('Migration process failed:', err);
				if (stderr) console.error(stderr);
				return reject(err);
			}
			if (stdout) console.log(stdout);
			if (stderr) console.error(stderr);
			console.log('Migrations finished successfully');
			resolve();
		});

		if (child.stdout) child.stdout.pipe(process.stdout);
		if (child.stderr) child.stderr.pipe(process.stderr);
	});
}

let server;
(async () => {
	try {
		await runMigrationsIfEnabled();
	} catch (err) {
		console.error('Unable to run migrations. Exiting.');
		process.exit(1);
	}

	server = app.listen(PORT, () => {
		console.log(`SMSSA Backend running on port ${PORT}`);
		
		// Initialize reminder scheduler - runs daily at 8 AM
		let reminderJob;
		try {
			// Schedule cron job: 0 8 * * * = 8 AM every day
			reminderJob = cron.schedule('0 8 * * *', async () => {
				console.log(`[${new Date().toISOString()}] Running follow-up reminder check...`);
				try {
					const result = await processDueReminders();
					console.log(`Reminder check complete: ${result.sent} sent, ${result.failed} failed`);
				} catch (err) {
					console.error('Error in reminder scheduler job:', err);
				}
				try {
					const visaResult = await processVisaExpiryAlerts();
					console.log(`Visa expiry alert check complete: ${visaResult.sent} sent, ${visaResult.failed} failed, ${visaResult.skipped} skipped`);
				} catch (err) {
					console.error('Error in visa expiry alert job:', err);
				}
			});
			
			console.log('✓ Follow-up reminder scheduler initialized (runs daily at 8 AM)');
			
			// Store the job reference for graceful shutdown
			global.reminderJob = reminderJob;
		} catch (err) {
			console.error('Failed to initialize reminder scheduler:', err);
		}
	});
})();

function gracefulShutdown() {
	console.log('Shutting down gracefully...');
	
	// Stop reminder scheduler
	if (global.reminderJob) {
		global.reminderJob.stop();
		console.log('Reminder scheduler stopped');
	}
	
	if (server && server.close) {
		server.close(() => process.exit(0));
	} else {
		process.exit(0);
	}
}

// Register signal handlers with additional diagnostics to help track unexpected shutdowns
console.log('Registering signal handlers for SIGINT and SIGTERM');
process.on('SIGINT', () => {
	console.log('SIGINT received - calling gracefulShutdown(); stack:');
	console.trace();
	gracefulShutdown();
});
process.on('SIGTERM', () => {
	console.log('SIGTERM received - calling gracefulShutdown(); stack:');
	console.trace();
	gracefulShutdown();
});

process.on('exit', (code) => {
	console.log('Process exiting with code', code);
});

module.exports = app;