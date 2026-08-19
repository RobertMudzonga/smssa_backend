const db = require('../db');

function getCorporateToken(req) {
  return req.headers['x-corporate-token'] || req.query.token || req.body?.token || null;
}

async function allowEmployeeOrCorporate(req, res, next) {
  const token = getCorporateToken(req);
  if (!token && req.user) return next();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const result = await db.query(
      `SELECT corporate_id, name
       FROM corporate_clients
       WHERE access_token = $1 AND is_active = TRUE
       LIMIT 1`,
      [token]
    );
    const corporate = result.rows[0];
    if (!corporate) {
      return res.status(401).json({ error: 'Invalid corporate access token' });
    }

    const requestedId = req.params.corporateId || req.query.corporate_client_id || req.body?.corporate_client_id;
    if (requestedId && String(requestedId) !== String(corporate.corporate_id)) {
      return res.status(403).json({ error: 'Corporate client access denied' });
    }

    req.corporateClient = corporate;
    next();
  } catch (error) {
    console.error('Corporate token validation failed:', error);
    res.status(500).json({ error: 'Failed to validate corporate access' });
  }
}

module.exports = { allowEmployeeOrCorporate, getCorporateToken };
