const express = require('express');
const router = express.Router();
const db = require('../db');
const emailService = require('../lib/emailService');

// Simple DB health check
router.get('/db', async (req, res) => {
  try {
    const result = await db.query('SELECT 1 as ok');
    return res.json({ ok: true, db: result.rows });
  } catch (err) {
    console.error('Debug DB check failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Test email SMTP connection
router.get('/email-test', async (req, res) => {
  try {
    const result = await emailService.testConnection();
    return res.json(result);
  } catch (err) {
    console.error('Email test failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Send a test email
router.post('/send-test-email', async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    if (!to) {
      return res.status(400).json({ error: 'Recipient email (to) is required' });
    }
    
    const result = await emailService.sendEmail({
      to,
      subject: subject || 'SMSSA Test Email',
      text: message || 'This is a test email from SMSSA notification system.',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>SMSSA Test Email</h2>
          <p>${message || 'This is a test email from SMSSA notification system.'}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toISOString()}</p>
        </div>
      `
    });
    
    return res.json(result);
  } catch (err) {
    console.error('Send test email failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
