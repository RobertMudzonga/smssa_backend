const express = require('express');
const router = express.Router();
const multer = require('multer');
const importer = require('../lib/importer');

const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /api/import - accept Excel upload
// Fields: file (multipart), target (prospects|projects|both), sheetName (optional)
router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const target = (req.body.target || 'both').toLowerCase();
        const sheetName = req.body.sheetName || null;
        const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;
        console.log('Import request:', { target, sheetName, dryRun, filename: req.file.originalname });
        const result = await importer.importFromBuffer(req.file.buffer, { target, sheetName, dryRun });
        console.log('Import result:', result && { prospects: result.prospects, projects: result.projects });
        return res.json({ ok: true, result });
    } catch (err) {
        console.error('Import route error:', err && err.stack ? err.stack : err);
        return res.status(500).json({ error: err.message || 'Import failed', stack: err.stack });
    }
});

module.exports = router;
