const fs = require('fs');
const path = require('path');
const importer = require('../lib/importer');

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node dry_run_import.js <file.xlsx|csv> [prospects|projects|both] [sheetName]');
    process.exit(1);
  }
  const filePath = path.resolve(argv[0]);
  const target = (argv[1] || 'both').toLowerCase();
  const sheetName = argv[2] || null;

  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  try {
    const result = await importer.importFromBuffer(buffer, { target, sheetName, dryRun: true });
    console.log('Dry-run import result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Dry-run failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
}

main();
