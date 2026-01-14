const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

// Cache info about the users table columns so we can adapt queries to existing schema
let _usersTableInfo = null;
async function resolveUsersTableInfo() {
  if (_usersTableInfo) return _usersTableInfo;
  try {
    const q = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
    `);
    const cols = new Set(q.rows.map(r => r.column_name));
    const info = {
      idCol: cols.has('id') ? 'id' : (cols.has('user_id') ? 'user_id' : 'id'),
      hasFullName: cols.has('full_name'),
      hasFirstLast: cols.has('first_name') && cols.has('last_name'),
      hasPasswordSalt: cols.has('password_salt'),
    };
    _usersTableInfo = info;
    return info;
  } catch (e) {
    console.warn('Could not resolve users table info', e.message || e);
    // fallback defaults
    _usersTableInfo = { idCol: 'id', hasFullName: true, hasFirstLast: false, hasPasswordSalt: true };
    return _usersTableInfo;
  }
}

function hashPassword(password, salt) {
  const key = crypto.scryptSync(password, salt, 64);
  return key.toString('hex');
}

function genSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_credentials' });
  if (!email.toLowerCase().endsWith('@immigrationspecialists.co.za')) return res.status(403).json({ error: 'domain_not_allowed' });
  try {
    // Try to insert user; if DB unavailable, respond with service_unavailable
    try {
      const salt = genSalt();
      const hash = hashPassword(password, salt);
      const info = await resolveUsersTableInfo();
      // Use the actual id column name and alias it to `id` for the API
      const insertSql = `INSERT INTO users (email, password_hash${info.hasPasswordSalt ? ', password_salt' : ''}, created_at) VALUES ($1,$2${info.hasPasswordSalt ? ', $3' : ''}, NOW()) RETURNING ${info.idCol} as id, email`;
      const params = info.hasPasswordSalt ? [email, hash, salt] : [email, hash];
      const q = await db.query(insertSql, params);
      const user = q.rows?.[0] || null;
      return res.status(201).json({ ok: true, user });
    } catch (e) {
      console.warn('DB insert failed for signup', e.message || e);
      // If DB unreachable, return allowed but warn
      return res.status(503).json({ ok: false, error: 'database_unavailable' });
    }
  } catch (err) {
    console.error('Signup error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_credentials' });
  if (!email.toLowerCase().endsWith('@immigrationspecialists.co.za')) return res.status(403).json({ error: 'domain_not_allowed' });
  try {
    try {
      const info = await resolveUsersTableInfo();
      // Build a select clause that aliases the actual id column to `id` and
      // tries to provide `full_name` either from `full_name` or by concatenating
      // `first_name` and `last_name` if available.
      let fullNameExpr = 'full_name';
      if (!info.hasFullName && info.hasFirstLast) {
        fullNameExpr = "coalesce(first_name,'') || ' ' || coalesce(last_name,'')";
      } else if (!info.hasFullName) {
        fullNameExpr = "''";
      }
      const selectSql = `SELECT ${info.idCol} as id, email, ${fullNameExpr} as full_name, password_hash, ${info.hasPasswordSalt ? 'password_salt' : "'' as password_salt"} FROM users WHERE email=$1 LIMIT 1`;
      const q = await db.query(selectSql, [email]);
      const user = q.rows?.[0] || null;
      if (!user) return res.status(401).json({ error: 'invalid_credentials' });
      if (user.password_hash && user.password_salt) {
        const computed = hashPassword(password, user.password_salt);
        if (computed !== user.password_hash) return res.status(401).json({ error: 'invalid_credentials' });
      } else {
        // no password set - reject
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      // strip sensitive fields before returning
      delete user.password_hash;
      delete user.password_salt;
      
      // Fetch employee info and permissions to attach to user object
      try {
        const employeeResult = await db.query(
          `SELECT e.id as employee_id, e.full_name, e.job_position, e.department, e.role, e.is_super_admin,
                  array_agg(DISTINCT ep.permission) FILTER (WHERE ep.permission IS NOT NULL) as permissions
           FROM employees e
           LEFT JOIN employee_permissions ep ON e.id = ep.employee_id
           WHERE e.work_email = $1
           GROUP BY e.id, e.full_name, e.job_position, e.department, e.role, e.is_super_admin
           LIMIT 1`,
          [email]
        );
        if (employeeResult.rows.length > 0) {
          const employee = employeeResult.rows[0];
          user.employee_id = employee.employee_id;
          user.full_name = employee.full_name;
          user.job_position = employee.job_position;
          user.department = employee.department;
          user.role = employee.role;
          user.is_super_admin = employee.is_super_admin || false;
          user.permissions = employee.permissions || [];
        }
      } catch (empErr) {
        console.warn('Could not fetch employee info for user:', empErr);
      }
      
      return res.json({ ok: true, user });
    } catch (e) {
      console.warn('DB login failed', e.message || e);
      // DB unavailable fallback for dev: allow login for domain emails if password equals DEV_FALLBACK_PASSWORD
      const devPass = process.env.DEV_FALLBACK_PASSWORD || 'devpass';
      if (password === devPass) {
        return res.json({ ok: true, user: { id: 'dev-' + email, email } });
      }
      return res.status(503).json({ ok: false, error: 'database_unavailable' });
    }
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  // Client handles clearing of local session; server can optionally revoke tokens
  return res.json({ ok: true });
});

module.exports = router;
