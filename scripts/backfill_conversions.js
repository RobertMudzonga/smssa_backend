#!/usr/bin/env node

/**
 * Backfill conversion_tracking table with existing won prospects
 * This script identifies all prospects that are marked as won and logs them
 * in the conversion_tracking table for historical reporting
 */

const db = require('../db');

async function backfillConversions() {
    console.log('Starting conversion tracking backfill...\n');
    
    try {
        // Find all prospects that are won but not in conversion_tracking
        const query = `
            SELECT 
                p.prospect_id,
                p.assigned_to,
                p.quote_amount,
                p.deal_name,
                p.current_stage_id,
                p.updated_at as conversion_date,
                p.first_name,
                p.last_name
            FROM prospects p
            LEFT JOIN conversion_tracking ct ON p.prospect_id = ct.prospect_id
            WHERE (p.current_stage_id = 6 OR p.status = 'won')
            AND ct.conversion_id IS NULL
            AND p.assigned_to IS NOT NULL
            ORDER BY p.updated_at
        `;
        
        const result = await db.query(query);
        const prospects = result.rows;
        
        if (prospects.length === 0) {
            console.log('✅ No conversions to backfill. All won prospects are already tracked.');
            process.exit(0);
        }
        
        console.log(`Found ${prospects.length} won prospects to backfill:\n`);
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const prospect of prospects) {
            try {
                // Parse assigned_to as integer
                const employeeId = parseInt(prospect.assigned_to);
                
                if (isNaN(employeeId)) {
                    console.log(`⚠️  Skipping prospect ${prospect.prospect_id}: invalid employee ID (${prospect.assigned_to})`);
                    errorCount++;
                    continue;
                }
                
                // Insert into conversion_tracking
                await db.query(
                    `INSERT INTO conversion_tracking 
                    (prospect_id, employee_id, conversion_date, quote_amount, deal_name, stage_id, notes) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (prospect_id) DO NOTHING`,
                    [
                        prospect.prospect_id,
                        employeeId,
                        prospect.conversion_date,
                        prospect.quote_amount,
                        prospect.deal_name,
                        prospect.current_stage_id,
                        'Backfilled from existing won prospect'
                    ]
                );
                
                const dealName = prospect.deal_name || `${prospect.first_name} ${prospect.last_name}`;
                console.log(`✅ Logged conversion: Prospect ${prospect.prospect_id} (${dealName}) - Employee ${employeeId}`);
                successCount++;
                
            } catch (err) {
                console.error(`❌ Error processing prospect ${prospect.prospect_id}:`, err.message);
                errorCount++;
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('Backfill complete!');
        console.log(`✅ Successfully logged: ${successCount} conversions`);
        if (errorCount > 0) {
            console.log(`❌ Errors: ${errorCount}`);
        }
        console.log('='.repeat(60) + '\n');
        
        // Show summary stats
        const statsQuery = `
            SELECT 
                e.id,
                e.full_name,
                COUNT(ct.conversion_id) as conversion_count,
                SUM(ct.quote_amount) as total_revenue
            FROM employees e
            INNER JOIN conversion_tracking ct ON e.id = ct.employee_id
            GROUP BY e.id, e.full_name
            ORDER BY conversion_count DESC
            LIMIT 10
        `;
        
        const stats = await db.query(statsQuery);
        
        if (stats.rows.length > 0) {
            console.log('Top Performers by Conversions:\n');
            stats.rows.forEach((row, i) => {
                const revenue = row.total_revenue ? `R${parseFloat(row.total_revenue).toLocaleString()}` : 'N/A';
                console.log(`${i + 1}. ${row.full_name}: ${row.conversion_count} conversions, ${revenue} revenue`);
            });
        }
        
    } catch (err) {
        console.error('Fatal error during backfill:', err);
        process.exit(1);
    } finally {
        await db.pool.end();
    }
}

// Run the backfill
backfillConversions();
