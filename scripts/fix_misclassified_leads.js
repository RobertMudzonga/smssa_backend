#!/usr/bin/env node
/**
 * Script: fix_misclassified_leads.js
 * Purpose: Find leads that were incorrectly created in the prospect pipeline
 * (i.e., `current_stage_id = 1`) but should be in the cold lead funnel.
 * It can run in `--dry-run` mode to preview affected rows, or execute to update
 * by setting `cold_lead_stage = 101` and clearing `current_stage_id`.
 *
 * Usage:
 *   node scripts/fix_misclassified_leads.js --dry-run
 *   node scripts/fix_misclassified_leads.js
 */

const db = require('../db');

async function preview(limit = 50) {
  const rows = await db.query(
    `SELECT lead_id, email, phone, source, created_at FROM leads
     WHERE current_stage_id = 1 AND (cold_lead_stage IS NULL OR cold_lead_stage = 0)
     AND (converted IS NOT TRUE OR converted IS NULL)
     ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.rows;
}

async function countAffected() {
  const res = await db.query(
    `SELECT COUNT(*)::int as cnt FROM leads
     WHERE current_stage_id = 1 AND (cold_lead_stage IS NULL OR cold_lead_stage = 0)
     AND (converted IS NOT TRUE OR converted IS NULL)`
  );
  return res.rows[0].cnt;
}

async function applyFix() {
  const res = await db.query(
    `UPDATE leads SET cold_lead_stage = 101, current_stage_id = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE current_stage_id = 1 AND (cold_lead_stage IS NULL OR cold_lead_stage = 0)
     AND (converted IS NOT TRUE OR converted IS NULL)`
  );
  return res.rowCount || 0;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : 50;

  try {
    const cnt = await countAffected();
    console.log(`Found ${cnt} leads matching criteria (current_stage_id=1, no cold_lead_stage).`);

    if (cnt === 0) {
      console.log('Nothing to do.');
      process.exit(0);
    }

    const sample = await preview(limit);
    console.log(`Previewing up to ${limit} recent affected leads:`);
    sample.forEach(r => console.log(` - id=${r.lead_id} email=${r.email || '<no email>'} phone=${r.phone || '<no phone>'} created=${r.created_at}`));

    if (dryRun) {
      console.log('\nDry run mode; no changes applied.');
      process.exit(0);
    }

    console.log('\nApplying fix: setting cold_lead_stage=101 and clearing current_stage_id...');
    const updated = await applyFix();
    console.log(`Updated ${updated} rows.`);
    process.exit(0);
  } catch (err) {
    console.error('Error running script:', err);
    process.exit(2);
  }
}

main();
