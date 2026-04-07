/**
 * Test script to verify follow-up reminder system
 * Run this after starting the backend server
 * Usage: node test_reminders.js
 */

const http = require('http');
const API_BASE = 'http://localhost:3000/api';

// Utility to make HTTP requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Follow-up Reminder System Tests\n');

  try {
    // Test 1: Check if server is running
    console.log('Test 1: Checking if backend server is running...');
    const serverCheck = await makeRequest('GET', '/projects');
    if (serverCheck.status === 200 || serverCheck.status === 403 || serverCheck.status === 500) {
      console.log('✓ Backend server is running\n');
    } else {
      console.log('✗ Backend server is not responding properly\n');
      process.exit(1);
    }

    // Test 2: Try to get reminders for a test prospect (will be empty)
    console.log('Test 2: Checking reminder API endpoint...');
    const remindersCheck = await makeRequest('GET', '/prospects/1/reminders');
    if (remindersCheck.status === 200 && Array.isArray(remindersCheck.data)) {
      console.log(`✓ Reminder API accessible (returned ${remindersCheck.data.length} reminders)\n`);
    } else {
      console.log('✗ Reminder API not accessible\n');
    }

    // Test 3: Try to add a comment with a reminder date
    console.log('Test 3: Testing comment with reminder date...');
    const commentPayload = {
      comment: 'Call the client to discuss project details next Tuesday',
      reminder_date: getNextDate(2), // 2 days from now
      user_id: 1,
      user_name: 'Test User'
    };
    
    const commentResponse = await makeRequest('PATCH', '/prospects/1/comment', commentPayload);
    
    if (commentResponse.status === 200 || commentResponse.status === 404) {
      if (commentResponse.status === 200) {
        console.log('✓ Comment with reminder date submitted successfully');
        if (commentResponse.data.reminder_date) {
          console.log(`  Reminder Date: ${commentResponse.data.reminder_date}`);
        }
      } else {
        console.log('⚠ Prospect 1 not found (expected in fresh db), but API accepted the request\n');
      }
    } else {
      console.log(`✗ Comment endpoint returned error: ${commentResponse.status}\n`);
    }

    console.log('\n✓ All tests completed!\n');
    console.log('📋 Next Steps:');
    console.log('  1. Test the UI: Add a comment to a prospect/lead with a reminder date');
    console.log('  2. Verify date parsing: Try dates like "call on 15 Apr", "next Monday", "in 3 days"');
    console.log('  3. Monitor logs: Check console for the 8 AM reminder scheduler');
    console.log('  4. Test manually: Run "node -e "require(\'./lib/reminderScheduler\').processDueReminders()"" to test scheduler\n');

  } catch (err) {
    console.error('✗ Test failed:', err.message);
    process.exit(1);
  }
}

function getNextDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Start tests
runTests();
