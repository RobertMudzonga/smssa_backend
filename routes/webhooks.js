const express = require('express');
const router = express.Router();
const { Webhook } = require('svix');
const db = require('../db');

function getWebhookSecret() {
  return process.env.CLERK_WEBHOOK_SECRET;
}

function resolveEmailAddress(user) {
  if (!user) return null;
  const emailAddresses = Array.isArray(user.email_addresses) ? user.email_addresses : [];
  const primary = user.primary_email_address_id
    ? emailAddresses.find((entry) => entry.id === user.primary_email_address_id)
    : null;
  const fallback = primary || emailAddresses[0] || null;
  return fallback?.email_address || null;
}

router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const secret = getWebhookSecret();
    if (!secret) {
      return res.status(500).json({ error: 'CLERK_WEBHOOK_SECRET is not configured' });
    }

    const payload = req.body.toString('utf8');
    const headers = {
      'svix-id': req.get('svix-id') || '',
      'svix-timestamp': req.get('svix-timestamp') || '',
      'svix-signature': req.get('svix-signature') || '',
    };

    const wh = new Webhook(secret);
    const evt = wh.verify(payload, headers);

    if (!evt || !evt.data) {
      return res.status(400).json({ error: 'invalid_webhook_payload' });
    }

    const eventType = evt.type;
    const user = evt.data || {};

    if (eventType === 'user.deleted') {
      await db.query(
        `UPDATE employees
         SET clerk_id = NULL,
             is_active = FALSE,
             updated_at = NOW()
         WHERE clerk_id = $1`,
        [user.id]
      );
      return res.status(200).json({ ok: true, event: eventType });
    }

    if (eventType === 'user.created' || eventType === 'user.updated') {
      const email = resolveEmailAddress(user);
      const firstName = user.first_name || '';
      const lastName = user.last_name || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || email || 'Unnamed employee';

      const existing = await db.query(
        `SELECT id FROM employees WHERE clerk_id = $1 OR work_email = $2 LIMIT 1`,
        [user.id, email]
      );

      if (existing.rows[0]) {
        await db.query(
          `UPDATE employees
           SET clerk_id = $1,
               full_name = $2,
               work_email = COALESCE($3, work_email),
               is_active = TRUE,
               updated_at = NOW()
           WHERE id = $4`,
          [user.id, fullName, email, existing.rows[0].id]
        );
      } else {
        await db.query(
          `INSERT INTO employees (clerk_id, full_name, work_email, job_position, department, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, 'Employee', NULL, TRUE, NOW(), NOW())`,
          [user.id, fullName, email]
        );
      }

      return res.status(200).json({ ok: true, event: eventType });
    }

    return res.status(200).json({ ok: true, event: eventType, ignored: true });
  } catch (error) {
    console.error('Clerk webhook error:', error);
    return res.status(400).json({ error: 'webhook_verification_failed' });
  }
});

module.exports = router;
