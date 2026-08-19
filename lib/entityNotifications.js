const emailService = require('./emailService');
const { notifyManagers } = require('./notifications');

const ADMIN_EMAIL = 'admin@immigrationspecialists.co.za';

async function notifyEntityCreated({ entityType, entityId, title, summary, link }) {
  const results = { email: null, inAppCount: 0 };

  try {
    results.email = await emailService.sendNotificationEmail({
      to: ADMIN_EMAIL,
      type: `${entityType}_created`,
      title,
      message: summary,
      link,
    });
  } catch (error) {
    console.error(`Failed to email admin about ${entityType} ${entityId}:`, error);
    results.email = { success: false, error: error.message };
  }

  try {
    const notifications = await notifyManagers({
      type: `${entityType}_created`,
      title,
      message: summary,
      related_entity_type: entityType,
      related_entity_id: entityId,
    });
    results.inAppCount = notifications.length;
  } catch (error) {
    console.error(`Failed to notify managers about ${entityType} ${entityId}:`, error);
  }

  return results;
}

module.exports = { notifyEntityCreated };
