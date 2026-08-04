(async () => {
  try {
    const path = require('path');
    const emailSvc = require(path.join(__dirname, '..', 'lib', 'emailService'));

    console.log('Running email test...');
    const conn = await emailSvc.testConnection();
    console.log('testConnection result:', conn);

    const recipients = ['robert@immigrationspecialists.co.za'];
    const emailData = {
      subject: 'SMSSA: Test message from local test_email.js',
      text: 'This is a test message sent by test_email.js',
      html: '<p>This is a test message sent by <strong>test_email.js</strong></p>'
    };

    const result = await emailSvc.sendBulkEmails(recipients, emailData);
    console.log('sendBulkEmails result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Email test failed:', e);
    process.exit(1);
  }
})();
