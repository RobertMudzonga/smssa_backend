const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET) {
  // Fail loudly rather than silently accepting/issuing unsigned sessions.
  console.error('FATAL: JWT_SECRET is not set. Set it in the environment before starting the server.');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

function signSession(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Verifies the Authorization bearer token (if present) and attaches the
// decoded, trusted claims to req.user. Never trusts client-supplied
// identity headers directly - x-user-email is normalized here so legacy
// route code that still reads it only ever sees the verified email.
function authenticate(req, res, next) {
  req.user = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (token && JWT_SECRET) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      req.user = null;
    }
  }

  if (req.user && req.user.email) {
    req.headers['x-user-email'] = req.user.email;
  } else {
    delete req.headers['x-user-email'];
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.is_super_admin) {
      return next();
    }
    const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (permissions.includes(permission)) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

module.exports = { JWT_SECRET, signSession, authenticate, requireAuth, requirePermission };
