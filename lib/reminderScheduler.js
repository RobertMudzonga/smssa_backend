/**
 * Reminder Scheduler - Sends follow-up reminders via email at 8 AM daily
 */

const db = require('../db');
const emailService = require('./emailService');
const { createNotification } = require('./notifications');
const moment = require('moment');

/**
 * Get today's date in YYYY-MM-DD format
 * @returns {string} - Today's date
 */
function getTodayDate() {
    return moment().format('YYYY-MM-DD');
}

/**
 * Get reminder details - prospect or lead name and context
 * @param {string} entityType - 'prospect' or 'lead'
 * @param {number} entityId - prospect_id or lead_id
 * @returns {Promise<object>} - Entity details
 */
async function getEntityDetails(entityType, entityId) {
    try {
        if (entityType === 'prospect') {
            const result = await db.query(
                `SELECT prospect_id, first_name, last_name, deal_name, email, phone, company 
                 FROM prospects WHERE prospect_id = $1`,
                [entityId]
            );
            if (result.rows.length > 0) {
                const p = result.rows[0];
                return {
                    name: p.deal_name || `${p.first_name} ${p.last_name}`.trim(),
                    email: p.email,
                    phone: p.phone,
                    company: p.company,
                    type: 'Prospect'
                };
            }
        } else if (entityType === 'lead') {
            const result = await db.query(
                `SELECT lead_id, first_name, last_name, email, phone, company 
                 FROM leads WHERE lead_id = $1`,
                [entityId]
            );
            if (result.rows.length > 0) {
                const l = result.rows[0];
                return {
                    name: `${l.first_name} ${l.last_name}`.trim(),
                    email: l.email,
                    phone: l.phone,
                    company: l.company,
                    type: 'Lead'
                };
            }
        }
    } catch (err) {
        console.error(`Error fetching ${entityType} details:`, err);
    }
    return null;
}

/**
 * Send reminder email for a follow-up
 * @param {object} reminder - Reminder record from database
 * @returns {Promise<boolean>} - Success status
 */
async function sendReminderEmail(reminder) {
    try {
        const entityDetails = await getEntityDetails(reminder.entity_type, 
            reminder.entity_type === 'prospect' ? reminder.prospect_id : reminder.lead_id);
        
        if (!entityDetails) {
            console.warn(`Could not find ${reminder.entity_type} ${reminder.entity_type === 'prospect' ? reminder.prospect_id : reminder.lead_id}`);
            return false;
        }

        const reminderDate = moment(reminder.reminder_date).format('dddd, MMMM D, YYYY');
        const emailSubject = `Follow-up Reminder: ${entityDetails.name} (${entityDetails.type})`;
        
        const emailBody = `
Hello,

This is a reminder for your follow-up action scheduled for today:

**Entity:** ${entityDetails.name} (${entityDetails.type})
**Scheduled Date:** ${reminderDate}
${entityDetails.company ? `**Company:** ${entityDetails.company}` : ''}
${entityDetails.email ? `**Email:** ${entityDetails.email}` : ''}
${entityDetails.phone ? `**Phone:** ${entityDetails.phone}` : ''}

**Note:**
${reminder.note_content || 'No specific note provided'}

Please complete this follow-up and update the contact record accordingly.

Best regards,
Sales Automation System
        `.trim();

        const htmlBody = `
<div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
    <h2 style="color: #1a73e8;">Follow-up Reminder</h2>
    <p>This is a reminder for your follow-up action scheduled for today:</p>
    
    <div style="background-color: #f0f0f0; padding: 15px; border-left: 4px solid #1a73e8; margin: 20px 0;">
        <p><strong>Entity:</strong> ${entityDetails.name} (${entityDetails.type})</p>
        <p><strong>Scheduled Date:</strong> ${reminderDate}</p>
        ${entityDetails.company ? `<p><strong>Company:</strong> ${entityDetails.company}</p>` : ''}
        ${entityDetails.email ? `<p><strong>Email:</strong> <a href="mailto:${entityDetails.email}">${entityDetails.email}</a></p>` : ''}
        ${entityDetails.phone ? `<p><strong>Phone:</strong> ${entityDetails.phone}</p>` : ''}
    </div>
    
    <div style="background-color: #f9f9f9; padding: 15px; border: 1px solid #ddd; margin: 20px 0;">
        <p><strong>Note:</strong></p>
        <p>${(reminder.note_content || 'No specific note provided').replace(/\n/g, '<br>')}</p>
    </div>
    
    <p style="color: #888; font-size: 13px; margin-top: 30px;">
        Please complete this follow-up and update the contact record accordingly.
    </p>
</div>
        `.trim();

        // Send email
        await emailService.sendEmail({
            to: reminder.assigned_user_email,
            subject: emailSubject,
            text: emailBody,
            html: htmlBody
        });

        return true;
    } catch (err) {
        console.error('Error sending reminder email:', err);
        return false;
    }
}

/**
 * Create in-app notification for reminder
 * @param {object} reminder - Reminder record
 * @returns {Promise<void>}
 */
async function createReminderNotification(reminder) {
    try {
        const entityLabel = reminder.entity_type === 'prospect' ? 'Prospect' : 'Lead';
        const entityId = reminder.entity_type === 'prospect' ? reminder.prospect_id : reminder.lead_id;
        
        await createNotification({
            employee_id: reminder.assigned_user_id,
            type: 'follow_up_reminder',
            title: `Follow-up Reminder Due Today`,
            message: `You have a scheduled follow-up for ${entityLabel} ID: ${entityId}`,
            related_entity_type: reminder.entity_type,
            related_entity_id: entityId
        });
    } catch (err) {
        console.error('Error creating reminder notification:', err);
    }
}

/**
 * Process all reminders due today
 * @returns {Promise<object>} - Summary of processed reminders
 */
async function processDueReminders() {
    const today = getTodayDate();
    const summary = {
        total: 0,
        sent: 0,
        failed: 0,
        errors: []
    };

    try {
        // Query for all pending reminders due today
        const result = await db.query(
            `SELECT * FROM follow_up_reminders 
             WHERE reminder_date = $1 AND status = 'pending'
             ORDER BY assigned_user_id`,
            [today]
        );

        summary.total = result.rows.length;
        console.log(`Found ${summary.total} reminders due for ${today}`);

        for (const reminder of result.rows) {
            try {
                // Send email
                const emailSent = await sendReminderEmail(reminder);
                
                if (emailSent) {
                    // Create in-app notification
                    await createReminderNotification(reminder);
                    
                    // Update reminder status to 'sent'
                    await db.query(
                        `UPDATE follow_up_reminders SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
                         WHERE reminder_id = $1`,
                        [reminder.reminder_id]
                    );
                    
                    summary.sent++;
                    console.log(`✓ Reminder ${reminder.reminder_id} sent to ${reminder.assigned_user_email}`);
                } else {
                    summary.failed++;
                    summary.errors.push({
                        reminderId: reminder.reminder_id,
                        reason: 'Email send failed'
                    });
                    console.error(`✗ Failed to send reminder ${reminder.reminder_id}`);
                }
            } catch (err) {
                summary.failed++;
                summary.errors.push({
                    reminderId: reminder.reminder_id,
                    error: err.message
                });
                console.error(`Error processing reminder ${reminder.reminder_id}:`, err);
            }
        }

        console.log(`Reminder processing complete: ${summary.sent} sent, ${summary.failed} failed`);
        return summary;
    } catch (err) {
        console.error('Error in processDueReminders:', err);
        throw err;
    }
}

/**
 * Get reminders for a specific date (for testing/reporting)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<array>} - List of reminders
 */
async function getRemindersForDate(date) {
    try {
        const result = await db.query(
            `SELECT * FROM follow_up_reminders 
             WHERE reminder_date = $1
             ORDER BY assigned_user_id, reminder_date`,
            [date]
        );
        return result.rows;
    } catch (err) {
        console.error('Error fetching reminders for date:', err);
        return [];
    }
}

module.exports = {
    processDueReminders,
    getRemindersForDate,
    getTodayDate,
    sendReminderEmail,
    createReminderNotification
};
