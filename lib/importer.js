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

async function getTableColumnsWithTypes(table) {
    const res = await db.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table]
    );
    const map = {};
    for (const r of res.rows) map[r.column_name] = r.data_type;
    return map;
}

function mapRowToColumns(row, availableColumns) {
    const mapped = {};
    for (const key of Object.keys(row)) {
        const n = normalizeHeader(key);
        if (!n) continue;
        if (availableColumns.includes(n)) {
            mapped[n] = row[key];
            continue;
        }
        const synonyms = {
            // --- Prospect-style synonyms ---
            firstname: 'first_name',
            firstname_: 'first_name',
            lastname: 'last_name',
            lastname_: 'last_name',
            fullname: 'first_name',
            name: 'first_name',
            contactname: 'first_name',
            companyname: 'company',
            company: 'company',
            company_name: 'company',
            emailaddress: 'email',
            email_addr: 'email',
            email: 'email',
            phonenumber: 'phone',
            phone_number: 'phone',
            mobile: 'phone',
            cellphone: 'phone',
            cell: 'phone',
            dealname: 'deal_name',
            assignedto: 'assigned_to',
            assigned_user: 'assigned_to',
            quotesentdate: 'quote_sent_date',
            quote_sent: 'quote_sent_date',
            quoteamount: 'quote_amount',
            quote_value: 'quote_amount',
            amount: 'quote_amount',
            total: 'quote_amount',
            professionalfees: 'professional_fees',
            professional_fee: 'professional_fees',
            depositamount: 'deposit_amount',
            deposit: 'deposit_amount',
            expectedclosingdate: 'expected_closing_date',
            expected_close: 'expected_closing_date',
            closing_date: 'expected_closing_date',
            status: 'status',
            source: 'source',
            pipeline_stage: 'pipeline_stage',

            // --- Project-style synonyms ---
            clientemail: 'client_email',
            email_client: 'client_email',
            emailaddress_client: 'client_email',
            expirationdate: 'end_date',
            expirydate: 'end_date',
            enddate: 'end_date',
            visa: 'visa_type_id',
            visatype: 'visa_type_id',
            visatypeid: 'visa_type_id',
            casetype: 'case_type',
            projectmanager: 'project_manager_id',
            manager: 'project_manager_id',
            project_manager: 'project_manager_id'
        };
        if (synonyms[n] && availableColumns.includes(synonyms[n])) {
            mapped[synonyms[n]] = row[key];
        }
    }
    return mapped;
}

function prepareValue(val) {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return val.toISOString();
    return String(val).trim();
}

function prepareTypedValue(val, dataType) {
    // Normalize basic types before insertion. Empty strings into numeric types should be NULL.
    const raw = prepareValue(val);
    if (raw === null) return null;
    const lowerType = (dataType || '').toLowerCase();
    const numericTypes = ['integer','bigint','smallint','numeric','decimal','real','double precision','money'];
    if (numericTypes.includes(lowerType)) {
        if (raw === '') return null;
        // return as string/number; let pg coerce if it's numeric string
        return raw;
    }
    if (lowerType === 'boolean') {
        if (raw === '') return null;
        const lc = raw.toLowerCase();
        if (lc === 'true' || lc === 't' || lc === '1') return true;
        if (lc === 'false' || lc === 'f' || lc === '0') return false;
        return null;
    }
    // default: return raw string (including empty string handled above)
    return raw;
}

async function insertRows(table, rows) {
    if (!rows || rows.length === 0) return { inserted: 0 };
    const client = await db.pool.connect();
    const projectContext = { employeeCache: new Map(), visaTypeCache: new Map() };
    try {
        await client.query('BEGIN');
        const tableCols = await getTableColumns(table);
        const tableColTypes = await getTableColumnsWithTypes(table);
        let inserted = 0;
        for (const row of rows) {
            const mapped = mapRowToColumns(row, tableCols);

            if (table === 'projects') {
                await enrichProjectRow({ mapped, raw: row, tableCols, tableColTypes, client, projectContext });
            }

            const columns = Object.keys(mapped);
            if (columns.length === 0) continue;
            const vals = columns.map(c => prepareTypedValue(mapped[c], tableColTypes[c]));
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

function findValueByNormalized(row, normalizedCandidates) {
    const targetSet = new Set(normalizedCandidates.map(normalizeHeader));
    for (const key of Object.keys(row)) {
        const norm = normalizeHeader(key);
        if (targetSet.has(norm)) return row[key];
    }
    return null;
}

async function resolveEmployeeIdByNameOrEmail(value, client, cache) {
    if (!value) return null;
    const key = String(value).trim().toLowerCase();
    if (!key) return null;
    if (cache.employeeCache?.has(key)) return cache.employeeCache.get(key);
    const q = `SELECT id FROM employees WHERE lower(full_name) = lower($1) OR lower(work_email) = lower($1) LIMIT 1`;
    const res = await client.query(q, [key]);
    const id = res.rows[0] ? res.rows[0].id : null;
    cache.employeeCache?.set(key, id);
    return id;
}

async function resolveVisaTypeIdByName(value, client, cache) {
    if (!value) return null;
    const key = String(value).trim().toLowerCase();
    if (!key) return null;
    if (cache.visaTypeCache?.has(key)) return cache.visaTypeCache.get(key);
    
    // Check if visa_types table exists first
    try {
        const tableCheck = await client.query(`SELECT to_regclass('public.visa_types') as exists`);
        if (!tableCheck.rows[0]?.exists) {
            console.warn('visa_types table does not exist; skipping visa type resolution');
            cache.visaTypeCache?.set(key, null);
            return null;
        }
    } catch (err) {
        console.warn('Failed to check visa_types table existence:', err.message || err);
        cache.visaTypeCache?.set(key, null);
        return null;
    }
    
    const sel = await client.query(`SELECT visa_type_id FROM visa_types WHERE lower(name) = lower($1) LIMIT 1`, [key]);
    if (sel.rows[0]) {
        const id = sel.rows[0].visa_type_id;
        cache.visaTypeCache?.set(key, id);
        return id;
    }
    // If not found, create a new visa type entry to preserve the source data.
    let id = null;
    try {
        const ins = await client.query(`INSERT INTO visa_types (name) VALUES ($1) RETURNING visa_type_id`, [value]);
        id = ins.rows[0]?.visa_type_id || null;
    } catch (err) {
        // avoid throwing import; log and continue with null
        console.warn('Visa type insert failed for', value, err.message || err);
    }
    cache.visaTypeCache?.set(key, id);
    return id;
}

async function enrichProjectRow({ mapped, raw, tableCols, tableColTypes, client, projectContext }) {
    // Fill client_email from generic email column
    if (tableCols.includes('client_email') && !mapped.client_email) {
        const emailVal = findValueByNormalized(raw, ['client_email', 'email', 'emailaddress']);
        if (emailVal) mapped.client_email = emailVal;
    }

    // Map expiration/expiry date into end_date
    if (tableCols.includes('end_date') && !mapped.end_date) {
        const expVal = findValueByNormalized(raw, ['expiration_date', 'expiry_date', 'end_date']);
        if (expVal) mapped.end_date = expVal;
    }

    // Resolve visa type name -> visa_type_id
    if (tableCols.includes('visa_type_id') && (mapped.visa_type_id === undefined || mapped.visa_type_id === null || mapped.visa_type_id === '')) {
        const visaVal = findValueByNormalized(raw, ['visa_type', 'visa', 'visa_type_name', 'case_type']);
        // If the cell already looks numeric, keep it; otherwise resolve by name
        if (visaVal && isNaN(Number(visaVal))) {
            const vtId = await resolveVisaTypeIdByName(visaVal, client, projectContext);
            if (vtId) mapped.visa_type_id = vtId;
            // Also keep the human-readable value in case_type when available so UI reflects dropdown text
            if (tableCols.includes('case_type') && !mapped.case_type) {
                mapped.case_type = visaVal;
            }
        } else if (visaVal) {
            mapped.visa_type_id = visaVal;
            if (tableCols.includes('case_type') && !mapped.case_type) {
                mapped.case_type = visaVal;
            }
        }
    }

    // Resolve project manager name/email -> project_manager_id
    if (tableCols.includes('project_manager_id')) {
        const currentVal = mapped.project_manager_id;
        const needsLookup = currentVal === undefined || currentVal === null || currentVal === '' || isNaN(Number(currentVal));
        if (needsLookup) {
            const mgrVal = findValueByNormalized(raw, ['project_manager', 'projectmanager', 'manager']);
            if (mgrVal) {
                const mgrId = await resolveEmployeeIdByNameOrEmail(mgrVal, client, projectContext);
                if (mgrId) mapped.project_manager_id = mgrId;
            }
        }
    }

    // Ensure numeric fields are null when empty strings for safety
    for (const col of Object.keys(mapped)) {
        const dt = tableColTypes[col];
        if (!dt) continue;
        const lowerType = (dt || '').toLowerCase();
        const numericTypes = ['integer','bigint','smallint','numeric','decimal','real','double precision','money'];
        if (numericTypes.includes(lowerType) && (mapped[col] === '' || mapped[col] === undefined)) {
            mapped[col] = null;
        }
    }
}

const DEFAULT_PROSPECTS_ORDER = [
    'first_name','last_name','email','phone','company','source','deal_name','assigned_to',
    'quote_sent_date','quote_amount','professional_fees','deposit_amount','expected_closing_date','status','pipeline_stage'
];

const DEFAULT_PROJECTS_ORDER = [
    'project_name','client_lead_id','client_first_name','client_last_name','company','visa_type_id','assigned_user_id','current_stage','start_date','end_date','status','budget'
];

async function importFromBuffer(buffer, options = {}) {
    const { target = 'both', sheetName = null, dryRun = false } = options;
    const wb = xlsx.read(buffer, { type: 'buffer', cellDates: true });
    const sheets = sheetName ? [sheetName] : wb.SheetNames;
    const total = { prospects: 0, projects: 0, mappedRows: {} };

    for (const s of sheets) {
        const ws = wb.Sheets[s];
        if (!ws) continue;

        // Try header-based parsing first
        let data = xlsx.utils.sheet_to_json(ws, { defval: null });
        const firstRow = data && data.length > 0 ? data[0] : null;
        const hasUsableHeaders = firstRow && Object.keys(firstRow).some(k => normalizeHeader(k));

        if (!hasUsableHeaders) {
            // Try to find a later header row (some spreadsheets have blank top rows)
            const rowsAll = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
            // find first row that contains at least one non-empty string cell
            let headerIndex = -1;
            for (let i = 0; i < Math.min(8, rowsAll.length); i++) {
                const row = rowsAll[i] || [];
                if (row.some(cell => cell !== null && String(cell).trim().length > 0)) {
                    headerIndex = i;
                    break;
                }
            }
            if (headerIndex !== -1 && headerIndex < rowsAll.length - 1) {
                const headerRow = rowsAll[headerIndex];
                const dataRows = rowsAll.slice(headerIndex + 1).filter(r => r && r.length > 0);
                if (dataRows.length === 0) continue;

                // Build objects using headerRow as keys
                const prospectsMapped = [];
                const projectsMapped = [];
                for (const arr of dataRows) {
                    const obj = {};
                    for (let i = 0; i < headerRow.length; i++) {
                        const key = headerRow[i];
                        if (!key) continue;
                        obj[key] = arr[i];
                    }
                    // map header-based object using normal mapping later
                    prospectsMapped.push(obj);
                    projectsMapped.push(obj);
                }

                if (target === 'prospects' || target === 'both') {
                    if (dryRun) {
                        total.mappedRows[s] = total.mappedRows[s] || {};
                        // use actual table columns for mapping
                        const tableCols = await getTableColumns('prospects');
                        total.mappedRows[s].prospects = prospectsMapped.slice(0, 50).map(row => mapRowToColumns(row, tableCols));
                    } else {
                        const res = await insertRows('prospects', prospectsMapped);
                        total.prospects += res.inserted;
                    }
                }

                if (target === 'projects' || target === 'both') {
                    if (dryRun) {
                        total.mappedRows[s] = total.mappedRows[s] || {};
                        const tableCols = await getTableColumns('projects');
                        total.mappedRows[s].projects = projectsMapped.slice(0, 50).map(row => mapRowToColumns(row, tableCols));
                    } else {
                        const res = await insertRows('projects', projectsMapped);
                        total.projects += res.inserted;
                    }
                }
                continue;
            }

            // Fallback: parse raw arrays and map by column position
            const rows = rowsAll;
            const dataRows = rows.slice(1).filter(r => r && r.length > 0);
            if (dataRows.length === 0) continue;

            const prospectsMapped = [];
            const projectsMapped = [];

            for (const arr of dataRows) {
                const objProspect = {};
                const objProject = {};
                for (let i = 0; i < arr.length; i++) {
                    if (i < DEFAULT_PROSPECTS_ORDER.length) objProspect[DEFAULT_PROSPECTS_ORDER[i]] = arr[i];
                    if (i < DEFAULT_PROJECTS_ORDER.length) objProject[DEFAULT_PROJECTS_ORDER[i]] = arr[i];
                }
                prospectsMapped.push(objProspect);
                projectsMapped.push(objProject);
            }

            if (target === 'prospects' || target === 'both') {
                if (dryRun) {
                    total.mappedRows[s] = total.mappedRows[s] || {};
                    total.mappedRows[s].prospects = prospectsMapped.slice(0, 50);
                } else {
                    const res = await insertRows('prospects', prospectsMapped);
                    total.prospects += res.inserted;
                }
            }

            if (target === 'projects' || target === 'both') {
                if (dryRun) {
                    total.mappedRows[s] = total.mappedRows[s] || {};
                    total.mappedRows[s].projects = projectsMapped.slice(0, 50);
                } else {
                    const res = await insertRows('projects', projectsMapped);
                    total.projects += res.inserted;
                }
            }

            continue;
        }

        // Normal header-based path
        // Fetch actual table columns so mapping can match normalized headers/synonyms
        let prospectsTableCols = [];
        let projectsTableCols = [];
        if (target === 'prospects' || target === 'both') {
            prospectsTableCols = await getTableColumns('prospects');
        }
        if (target === 'projects' || target === 'both') {
            projectsTableCols = await getTableColumns('projects');
        }

        if (target === 'prospects' || target === 'both') {
            if (dryRun) {
                total.mappedRows[s] = total.mappedRows[s] || {};
                total.mappedRows[s].prospects = data.slice(0, 50).map(row => mapRowToColumns(row, prospectsTableCols));
            } else {
                const res = await insertRows('prospects', data);
                total.prospects += res.inserted;
            }
        }

        if (target === 'projects' || target === 'both') {
            if (dryRun) {
                total.mappedRows[s] = total.mappedRows[s] || {};
                total.mappedRows[s].projects = data.slice(0, 50).map(row => mapRowToColumns(row, projectsTableCols));
            } else {
                const res = await insertRows('projects', data);
                total.projects += res.inserted;
            }
        }
    }
    return total;
}

module.exports = { importFromBuffer };
