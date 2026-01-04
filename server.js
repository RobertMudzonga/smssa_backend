const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');

if (process.env.NODE_ENV !== 'production') {
	require('dotenv').config();
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(
	cors({
		origin: process.env.CORS_ORIGIN || '*',
		methods: ['GET', 'POST', 'PATCH', 'DELETE'],
	})
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const leadsRouter = require('./routes/leads');
const projectsRouter = require('./routes/projects');
const prospectsRouter = require('./routes/prospects');
const documentsRouter = require('./routes/documents');
const employeesRouter = require('./routes/employees');
const appraisalsRouter = require('./routes/appraisals');
const importsRouter = require('./routes/imports');
const checklistsRouter = require('./routes/checklists');
const functionsRouter = require('./routes/functions');
const templatesRouter = require('./routes/templates');
const authRouter = require('./routes/auth');
const clientPortalRouter = require('./routes/client_portal');
const debugRouter = require('./routes/debug');

app.get('/', (req, res) => {
	res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

app.use('/api/leads', leadsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/prospects', prospectsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/appraisals', appraisalsRouter);
app.use('/api/import', importsRouter);
app.use('/api/checklists', checklistsRouter);
app.use('/api/functions', functionsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/auth', authRouter);
app.use('/api/client-portal', clientPortalRouter);
app.use('/api/debug', debugRouter);

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
	});
})();

function gracefulShutdown() {
	console.log('Shutting down gracefully...');
	if (server && server.close) {
		server.close(() => process.exit(0));
	} else {
		process.exit(0);
	}
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = app;