// Test script for legal cases API
const http = require('http');

const testCases = [
    {
        case_type: 'overstay_appeal',
        case_title: 'Test Overstay Appeal Case',
        client_name: 'John Doe',
        client_email: 'john@example.com',
        priority: 'high'
    },
    {
        case_type: 'prohibited_persons',
        case_title: 'Test Prohibited Persons Case',
        client_name: 'Jane Smith',
        client_email: 'jane@example.com',
        priority: 'medium'
    },
    {
        case_type: 'high_court_expedition',
        case_title: 'Test High Court Case',
        client_name: 'Bob Wilson',
        client_email: 'bob@example.com',
        priority: 'urgent'
    }
];

async function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    console.log('=== Testing Legal Cases API ===\n');
    
    // Test 1: Create cases
    console.log('1. Creating test cases...');
    const createdCases = [];
    for (const testCase of testCases) {
        try {
            const result = await makeRequest('POST', '/api/legal-cases', testCase);
            console.log(`   Created ${testCase.case_type}: ${result.status === 201 ? 'SUCCESS' : 'FAILED'}`);
            if (result.status === 201) {
                createdCases.push(result.data);
                console.log(`   Case ID: ${result.data.case_id}, Reference: ${result.data.case_reference}`);
            } else {
                console.log(`   Error: ${JSON.stringify(result.data)}`);
            }
        } catch (err) {
            console.log(`   Error: ${err.message}`);
        }
    }
    
    console.log('\n2. Fetching all cases...');
    try {
        const result = await makeRequest('GET', '/api/legal-cases');
        console.log(`   Found ${result.data.total} cases`);
    } catch (err) {
        console.log(`   Error: ${err.message}`);
    }
    
    // Test 3: Test workflow advancement
    console.log('\n3. Testing workflow advancement...');
    if (createdCases.length > 0) {
        const testCase = createdCases[0];
        console.log(`   Testing with case: ${testCase.case_reference} (${testCase.case_type})`);
        console.log(`   Current step: ${testCase.current_step} - ${testCase.current_step_name}`);
        
        // Advance to next step
        try {
            const advanceResult = await makeRequest('POST', `/api/legal-cases/${testCase.case_id}/advance`);
            console.log(`   Advanced to step: ${advanceResult.data.current_step} - ${advanceResult.data.case?.current_step_name}`);
            console.log(`   Message: ${advanceResult.data.message}`);
        } catch (err) {
            console.log(`   Error advancing: ${err.message}`);
        }
    }
    
    // Test 4: Test stats endpoint
    console.log('\n4. Testing stats endpoint...');
    try {
        const result = await makeRequest('GET', '/api/legal-cases/stats');
        console.log(`   Stats by type: ${JSON.stringify(result.data.by_type || {})}`);
        console.log(`   Stats by status: ${JSON.stringify(result.data.by_status || {})}`);
        console.log(`   Upcoming deadlines: ${result.data.upcoming_deadlines?.length || 0}`);
        console.log(`   Overdue cases: ${result.data.overdue_cases?.length || 0}`);
    } catch (err) {
        console.log(`   Error: ${err.message}`);
    }
    
    // Test 5: Test workflow step names
    console.log('\n5. Testing workflow step names (from a case)...');
    if (createdCases.length > 0) {
        const testCase = await makeRequest('GET', `/api/legal-cases/${createdCases[0].case_id}`);
        console.log(`   Case: ${testCase.data.case_reference}`);
        console.log(`   Step history:`);
        for (const step of testCase.data.step_history || []) {
            console.log(`   - Step ${step.step_id}: ${step.step_name} (${step.status})`);
        }
    }
    
    // Test 6: Test Prohibited Persons outcome/appeal workflow
    console.log('\n6. Testing Prohibited Persons outcome (Lost -> Appeal)...');
    const ppCase = createdCases.find(c => c.case_type === 'prohibited_persons');
    if (ppCase) {
        // Advance to step 5 (Outcome)
        for (let i = ppCase.current_step; i < 5; i++) {
            await makeRequest('POST', `/api/legal-cases/${ppCase.case_id}/advance`);
        }
        console.log(`   Advanced to Outcome step`);
        
        // Set outcome to Lost
        try {
            const outcomeResult = await makeRequest('POST', `/api/legal-cases/${ppCase.case_id}/outcome`, { outcome: 'lost', notes: 'Test appeal trigger' });
            console.log(`   Outcome set to LOST`);
            console.log(`   Original case status: ${outcomeResult.data.case?.case_status}`);
            console.log(`   Next actions: ${outcomeResult.data.next_actions?.join(', ') || 'N/A'}`);
            
            // Now trigger appeal (separate call as per business logic)
            const appealResult = await makeRequest('POST', `/api/legal-cases/${ppCase.case_id}/appeal`, { notes: 'Triggering test appeal' });
            console.log(`   Appeal triggered!`);
            console.log(`   Appeal case: ${appealResult.data.appeal_case?.case_reference || 'N/A'}`);
            console.log(`   Appeal number: ${appealResult.data.appeal_number}`);
        } catch (err) {
            console.log(`   Error: ${err.message}`);
        }
    }

    // Test 7: Test High Court Settlement workflow
    console.log('\n7. Testing High Court Settlement workflow...');
    const hcCase = createdCases.find(c => c.case_type === 'high_court_expedition');
    if (hcCase) {
        // First, need to mark the 14-day notification period as satisfied
        try {
            await makeRequest('POST', `/api/legal-cases/${hcCase.case_id}/notification-period`, { satisfied: true });
            console.log('   14-day notification period marked as satisfied');
            
            // Advance to step 7 (Settlement)
            let currentStep = hcCase.current_step;
            while (currentStep < 7) {
                const result = await makeRequest('POST', `/api/legal-cases/${hcCase.case_id}/advance`);
                currentStep = result.data.current_step;
            }
            console.log(`   Advanced to step ${currentStep}`);
            
            // Test settlement (Settled)
            const settlementResult = await makeRequest('POST', `/api/legal-cases/${hcCase.case_id}/settlement`, { settlement_outcome: 'settled', notes: 'Case settled out of court' });
            console.log(`   Settlement result: ${settlementResult.data.message || JSON.stringify(settlementResult.data)}`);
        } catch (err) {
            console.log(`   Error: ${err.message}`);
        }
    }
    
    console.log('\n=== Tests Complete ===');
}

runTests().catch(console.error);
