const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node inspect_xlsx.js <file.xlsx>');
    process.exit(1);
  }
  const filePath = path.resolve(argv[0]);
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  const wb = xlsx.readFile(filePath, { cellDates: true });
  console.log('Sheets:', wb.SheetNames);
  for (const s of wb.SheetNames) {
    const ws = wb.Sheets[s];
    const data = xlsx.utils.sheet_to_json(ws, { defval: null, header: 1 });
    console.log(`Sheet: ${s} — rows: ${data.length}`);
    if (data.length > 0) {
      console.log('First row (headers/raw):', data[0].slice(0, 30));
      console.log('Second row sample:', data[1] ? data[1].slice(0, 30) : null);
    }
  }
}

main();
