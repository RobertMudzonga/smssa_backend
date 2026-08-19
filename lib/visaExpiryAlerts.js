const db = require('../db');
const emailService = require('./emailService');
const { notifyManagers } = require('./notifications');

const ADMIN_EMAIL = 'admin@immigrationspecialists.co.za';
const ALERT_WINDOWS = [180, 150, 120];

async function claimAlert(visaId, alertDays) {
  const result = await db.query(
    `INSERT INTO employee_visa_alerts (visa_id, alert_days, status, attempt_count, updated_at)
     VALUES ($1, $2, 'pending', 1, CURRENT_TIMESTAMP)
     ON CONFLICT (visa_id, alert_days) DO UPDATE
       SET status = 'pending', attempt_count = employee_visa_alerts.attempt_count + 1,
           last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE employee_visa_alerts.status = 'failed'
     RETURNING alert_id`,
    [visaId, alertDays]
  );
  return result.rows[0]?.alert_id || null;
}

async function markAlertSent(alertId) {
  await db.query(
    `UPDATE employee_visa_alerts
     SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE alert_id = $1`,
    [alertId]
  );
}

async function markAlertFailed(alertId, error) {
  await db.query(
    `UPDATE employee_visa_alerts
     SET status = 'failed', last_error = $2, updated_at = CURRENT_TIMESTAMP
     WHERE alert_id = $1`,
    [alertId, String(error?.message || error).slice(0, 2000)]
  );
}

async function processVisaExpiryAlerts() {
  const result = await db.query(
    `SELECT ev.visa_id, ev.employee_name, ev.employee_email, ev.visa_type_name,
            ev.visa_expiry_date, cc.name AS company_name
     FROM employee_visas ev
     LEFT JOIN corporate_clients cc ON cc.corporate_id = ev.corporate_client_id
     WHERE ev.status IN ('active', 'pending_renewal')
       AND ev.visa_expiry_date IN (
         CURRENT_DATE + 180,
         CURRENT_DATE + 150,
         CURRENT_DATE + 120
       )`
  );

  const summary = { found: result.rows.length, sent: 0, failed: 0, skipped: 0 };

  for (const visa of result.rows) {
    const alertDays = Math.round((new Date(visa.visa_expiry_date).getTime() - Date.now()) / 86400000);
    const normalizedDays = ALERT_WINDOWS.reduce((closest, value) =>
      Math.abs(value - alertDays) < Math.abs(closest - alertDays) ? value : closest
    );
    const alertId = await claimAlert(visa.visa_id, normalizedDays);
    if (!alertId) {
      summary.skipped += 1;
      continue;
    }

    const title = `Visa expiry in ${normalizedDays} days: ${visa.employee_name}`;
    const message = `${visa.employee_name}'s ${visa.visa_type_name || 'visa'} for ${visa.company_name || 'a corporate client'} expires on ${new Date(visa.visa_expiry_date).toLocaleDateString()}.`;

    try {
      const emailResult = await emailService.sendNotificationEmail({
        to: ADMIN_EMAIL,
        type: 'visa_expiry',
        title,
        message,
      });
      if (!emailResult.success) {
        throw new Error(emailResult.error || 'Visa expiry email failed');
      }

      await notifyManagers({
        type: 'visa_expiry',
        title,
        message,
        related_entity_type: 'employee_visa',
        related_entity_id: visa.visa_id,
      });

      await markAlertSent(alertId);
      summary.sent += 1;
    } catch (error) {
      await markAlertFailed(alertId, error);
      summary.failed += 1;
      console.error(`Visa alert failed for visa ${visa.visa_id}:`, error);
    }
  }

  return summary;
}

module.exports = { processVisaExpiryAlerts, ALERT_WINDOWS };
