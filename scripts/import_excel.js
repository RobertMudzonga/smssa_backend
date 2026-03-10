#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const db = require('../db');

function normalizeHeader(h) {
    if (!h && h !== 0) return '';
    return String(h)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/_+/g, '_');
}

async function getTableColumns(table) {
    const res = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table]
    );
    return res.rows.map(r => r.column_name);
}

function mapRowToColumns(row, availableColumns) {
    const mapped = {};
    for (const key of Object.keys(row)) {
        const n = normalizeHeader(key);
        if (!n) continue;
        // simple mapping: use normalized header if column exists
        if (availableColumns.includes(n)) {
            mapped[n] = row[key];
            continue;
        }
        // try some common synonyms
        const synonyms = {
            firstname: 'first_name',
            firstname_: 'first_name',
            firstname: 'first_name',
            lastname: 'last_name',
            lastname_: 'last_name',
            companyname: 'company',
            emailaddress: 'email',
            phonenumber: 'phone',
            dealname: 'deal_name',
            assignedto: 'assigned_to',
            quotesentdate: 'quote_sent_date',
            quoteamount: 'quote_amount',
            professionalfees: 'professional_fees',
            depositamount: 'deposit_amount',
            expectedclosingdate: 'expected_closing_date',
            status: 'status',
            source: 'source'
        };
        if (synonyms[n] && availableColumns.includes(synonyms[n])) {
            mapped[synonyms[n]] = row[key];
        }
    }
    return mapped;
}

function prepareValue(val) {
    if (val === null || val === undefined) return null;
    // Excel date objects may be JS dates or numbers; let pg handle string dates
    if (val instanceof Date) return val.toISOString();
    return String(val).trim();
}

async function insertRows(table, rows) {
    if (!rows || rows.length === 0) return { inserted: 0 };
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const tableCols = await getTableColumns(table);

        let inserted = 0;
        for (const row of rows) {
            const mapped = mapRowToColumns(row, tableCols);
            const columns = Object.keys(mapped);
            if (columns.length === 0) continue;
            const vals = columns.map(c => prepareValue(mapped[c]));
            const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
            const colList = columns.join(', ');
            const q = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`;
            await client.query(q, vals);
            inserted++;
        }
        await client.query('COMMIT');
        return { inserted };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function main() {
    const argv = process.argv.slice(2);
    if (argv.length === 0) {
        console.error('Usage: node import_excel.js <file.xlsx> [prospects|projects|both] [sheetName]');
        process.exit(1);
    }
    const filePath = path.resolve(argv[0]);
    const target = (argv[1] || 'both').toLowerCase();
    const sheetName = argv[2] || null;

    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        process.exit(1);
    }

    const wb = xlsx.readFile(filePath, { cellDates: true });
    const sheets = sheetName ? [sheetName] : wb.SheetNames;

    let totalInserted = { prospects: 0, projects: 0 };

    for (const s of sheets) {
        const ws = wb.Sheets[s];
        if (!ws) continue;
        const data = xlsx.utils.sheet_to_json(ws, { defval: null });
        if (data.length === 0) continue;

        console.log(`Processing sheet: ${s} (${data.length} rows)`);

        if (target === 'prospects' || target === 'both') {
            // Heuristic: if sheet name or headers include prospect keywords
            const res = await insertRows('prospects', data);
            totalInserted.prospects += res.inserted;
            console.log(`Inserted ${res.inserted} rows into prospects`);
        }

        if (target === 'projects' || target === 'both') {
            const res = await insertRows('projects', data);
            totalInserted.projects += res.inserted;
            console.log(`Inserted ${res.inserted} rows into projects`);
        }
    }

    console.log('Import complete. Summary:', totalInserted);
    process.exit(0);
}

main().catch(err => {
    console.error('Import failed:', err);
    process.exit(2);
});
