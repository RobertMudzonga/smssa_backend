#!/usr/bin/env node

/**
 * Test script for employee conversion reporting
 * Tests the new /api/employees/reports/conversions endpoint
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';

async function testConversionReports() {
    console.log('Testing Employee Conversion Reports\n');
    console.log('='.repeat(60) + '\n');
    
    try {
        // Test 1: Get all-time conversion reports
        console.log('Test 1: Getting all-time conversion reports...');
        const response1 = await fetch(`${API_BASE}/employees/reports/conversions`);
        
        if (!response1.ok) {
            throw new Error(`HTTP ${response1.status}: ${await response1.text()}`);
        }
        
        const data1 = await response1.json();
        console.log('✅ Success!');
        console.log(`   Total employees: ${data1.total_employees}`);
        console.log(`   Total conversions: ${data1.total_conversions}`);
        console.log(`   Total revenue: R${data1.total_revenue.toLocaleString()}`);
        console.log(`   Date range: ${data1.start_date} to ${data1.end_date}\n`);
        
        if (data1.employees && data1.employees.length > 0) {
            console.log('   Top 3 performers:');
            data1.employees.slice(0, 3).forEach((emp, i) => {
                console.log(`   ${i + 1}. ${emp.employee_name} (${emp.job_position})`);
                console.log(`      Conversions: ${emp.conversion_count}`);
                console.log(`      Revenue: R${emp.total_revenue.toLocaleString()}`);
                console.log(`      Avg deal: R${emp.avg_deal_size.toLocaleString()}`);
                if (emp.conversions && emp.conversions.length > 0) {
                    console.log(`      Latest: ${emp.conversions[0].deal_name || 'N/A'}`);
                }
                console.log();
            });
        }
        
        // Test 2: Get conversions for specific date range
        console.log('\n' + '='.repeat(60) + '\n');
        console.log('Test 2: Getting conversions for 2026...');
        const response2 = await fetch(`${API_BASE}/employees/reports/conversions?start_date=2026-01-01&end_date=2026-12-31`);
        
        if (!response2.ok) {
            throw new Error(`HTTP ${response2.status}: ${await response2.text()}`);
        }
        
        const data2 = await response2.json();
        console.log('✅ Success!');
        console.log(`   Total conversions in 2026: ${data2.total_conversions}`);
        console.log(`   Total revenue in 2026: R${data2.total_revenue.toLocaleString()}\n`);
        
        // Test 3: Verify individual employee endpoint still works
        console.log('\n' + '='.repeat(60) + '\n');
        console.log('Test 3: Verifying employee list endpoint...');
        const response3 = await fetch(`${API_BASE}/employees`);
        
        if (!response3.ok) {
            throw new Error(`HTTP ${response3.status}: ${await response3.text()}`);
        }
        
        const employees = await response3.json();
        console.log('✅ Success!');
        console.log(`   Total employees: ${employees.length}`);
        
        const empWithConversions = employees.filter(e => e.conversions_count > 0);
        console.log(`   Employees with conversions: ${empWithConversions.length}`);
        
        if (empWithConversions.length > 0) {
            console.log('\n   Sample employee data:');
            const sample = empWithConversions[0];
            console.log(`   - Name: ${sample.full_name}`);
            console.log(`   - Position: ${sample.job_position}`);
            console.log(`   - Projects: ${sample.projects_count}`);
            console.log(`   - Conversions: ${sample.conversions_count}`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ All tests passed!');
        console.log('='.repeat(60) + '\n');
        
    } catch (err) {
        console.error('\n❌ Test failed:', err.message);
        console.error('   Make sure the server is running on', API_BASE);
        process.exit(1);
    }
}

// Run tests
testConversionReports();
