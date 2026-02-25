const nodemailer = require('nodemailer');

/**
 * Email Service Module
 * Handles all email notifications for SMSSA system
 * 
 * Configuration via environment variables:
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP port (587 for TLS, 465 for SSL)
 * - SMTP_SECURE: Use SSL (true for port 465, false for 587 with STARTTLS)
 * - SMTP_USER: Email username
 * - SMTP_PASSWORD: Email password
 * - SMTP_FROM: From address with display name
 */

// Create transporter with SMTP settings
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'lnxwsd07.hostserv.co.za',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true', // true for SSL on port 465
    auth: {
        user: process.env.SMTP_USER || 'notification@mcmf.co.za',
        pass: process.env.SMTP_PASSWORD
    },
    tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
    }
});

// Verify transporter configuration on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Email transporter verification failed:', error.message);
    } else {
        console.log('✅ Email transporter initialized successfully');
        console.log(`   Host: ${process.env.SMTP_HOST || 'lnxwsd07.hostserv.co.za'}`);
        console.log(`   Port: ${process.env.SMTP_PORT || 465}`);
        console.log(`   User: ${process.env.SMTP_USER || 'notification@mcmf.co.za'}`);
    }
});

/**
 * Send a basic email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text body (optional)
 * @param {string} options.html - HTML body (optional)
 * @returns {Promise<Object>} Send result
 */
async function sendEmail({ to, subject, text, html }) {
    try {
        const mailOptions = {
            from: process.env.SMTP_FROM || 'SMSSA Notifications <notification@mcmf.co.za>',
            to,
            subject,
            text,
            html
        };

        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully to ${to}: ${result.messageId}`);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error(`❌ Failed to send email to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send notification email
 * @param {Object} options - Notification options
 * @param {string} options.to - Recipient email
 * @param {string} options.type - Notification type
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message
 * @param {string} options.link - Optional link to include
 * @returns {Promise<Object>} Send result
 */
async function sendNotificationEmail({ to, type, title, message, link }) {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
                .footer { background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
                .notification-type { display: inline-block; background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 4px; font-size: 12px; text-transform: uppercase; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>SMSSA Notification</h1>
                </div>
                <div class="content">
                    <span class="notification-type">${type}</span>
                    <h2>${title}</h2>
                    <p>${message}</p>
                    ${link ? `<a href="${link}" class="button">View Details</a>` : ''}
                </div>
                <div class="footer">
                    <p>This is an automated notification from SMSSA. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return sendEmail({
        to,
        subject: `[SMSSA] ${title}`,
        text: `${type}: ${title}\n\n${message}${link ? `\n\nView details: ${link}` : ''}`,
        html
    });
}

/**
 * Send assignment notification email
 * @param {Object} options - Assignment options
 * @param {string} options.to - Recipient email
 * @param {string} options.assigneeName - Name of person assigned
 * @param {string} options.entityType - Type of entity (prospect, client, project)
 * @param {string} options.entityName - Name of the entity
 * @param {string} options.assignedBy - Name of person who made the assignment
 * @param {string} options.link - Link to view the entity
 * @returns {Promise<Object>} Send result
 */
async function sendAssignmentEmail({ to, assigneeName, entityType, entityName, assignedBy, link }) {
    return sendNotificationEmail({
        to,
        type: 'Assignment',
        title: `New ${entityType} Assigned`,
        message: `Hi ${assigneeName},\n\nYou have been assigned to ${entityType}: <strong>${entityName}</strong>${assignedBy ? ` by ${assignedBy}` : ''}.`,
        link
    });
}

/**
 * Send leave request notification email
 * @param {Object} options - Leave request options
 * @param {string} options.to - Recipient email (manager)
 * @param {string} options.employeeName - Name of employee requesting leave
 * @param {string} options.leaveType - Type of leave
 * @param {string} options.startDate - Start date
 * @param {string} options.endDate - End date
 * @param {number} options.days - Number of days
 * @param {string} options.link - Link to view/approve request
 * @returns {Promise<Object>} Send result
 */
async function sendLeaveRequestEmail({ to, employeeName, leaveType, startDate, endDate, days, link }) {
    return sendNotificationEmail({
        to,
        type: 'Leave Request',
        title: `New Leave Request from ${employeeName}`,
        message: `${employeeName} has submitted a leave request:\n\n<strong>Leave Type:</strong> ${leaveType}\n<strong>From:</strong> ${startDate}\n<strong>To:</strong> ${endDate}\n<strong>Days:</strong> ${days}`,
        link
    });
}

/**
 * Send payment request notification email
 * @param {Object} options - Payment request options
 * @param {string} options.to - Recipient email
 * @param {string} options.requesterName - Name of requester
 * @param {string} options.projectName - Project name
 * @param {number} options.amount - Payment amount
 * @param {string} options.description - Payment description
 * @param {string} options.link - Link to view/approve request
 * @returns {Promise<Object>} Send result
 */
async function sendPaymentRequestEmail({ to, requesterName, projectName, amount, description, link }) {
    return sendNotificationEmail({
        to,
        type: 'Payment Request',
        title: `Payment Request for ${projectName}`,
        message: `${requesterName} has submitted a payment request:\n\n<strong>Project:</strong> ${projectName}\n<strong>Amount:</strong> R ${amount.toLocaleString()}\n<strong>Description:</strong> ${description}`,
        link
    });
}

/**
 * Send document upload notification email
 * @param {Object} options - Document options
 * @param {string} options.to - Recipient email
 * @param {string} options.uploaderName - Name of uploader
 * @param {string} options.documentName - Document name
 * @param {string} options.entityType - Related entity type
 * @param {string} options.entityName - Related entity name
 * @param {string} options.link - Link to view document
 * @returns {Promise<Object>} Send result
 */
async function sendDocumentUploadEmail({ to, uploaderName, documentName, entityType, entityName, link }) {
    return sendNotificationEmail({
        to,
        type: 'Document Upload',
        title: `New Document Uploaded: ${documentName}`,
        message: `${uploaderName} has uploaded a new document:\n\n<strong>Document:</strong> ${documentName}\n<strong>${entityType}:</strong> ${entityName}`,
        link
    });
}

/**
 * Send bulk emails to multiple recipients
 * @param {Array<string>} recipients - Array of email addresses
 * @param {Object} emailData - Email data (subject, text, html)
 * @returns {Promise<Object>} Results summary
 */
async function sendBulkEmails(recipients, emailData) {
    const results = {
        total: recipients.length,
        successful: 0,
        failed: 0,
        errors: []
    };

    for (const to of recipients) {
        const result = await sendEmail({ to, ...emailData });
        if (result.success) {
            results.successful++;
        } else {
            results.failed++;
            results.errors.push({ to, error: result.error });
        }
    }

    console.log(`📧 Bulk email complete: ${results.successful}/${results.total} sent successfully`);
    return results;
}

/**
 * Test email connection
 * @returns {Promise<Object>} Connection test result
 */
async function testConnection() {
    try {
        await transporter.verify();
        return { 
            success: true, 
            message: 'SMTP connection verified',
            config: {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                user: process.env.SMTP_USER,
                from: process.env.SMTP_FROM
            }
        };
    } catch (error) {
        return { 
            success: false, 
            error: error.message,
            config: {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                user: process.env.SMTP_USER
            }
        };
    }
}

module.exports = {
    sendEmail,
    sendNotificationEmail,
    sendAssignmentEmail,
    sendLeaveRequestEmail,
    sendPaymentRequestEmail,
    sendDocumentUploadEmail,
    sendBulkEmails,
    testConnection,
    transporter
};
