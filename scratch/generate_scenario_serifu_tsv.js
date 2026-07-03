import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sheets = ['シナリオマスタ', 'セリフマスタ'];

sheets.forEach(name => {
  const csvPath = path.join(__dirname, `../public/sheets/${name}.csv`);
  const csvContent = fs.readFileSync(csvPath, 'utf8');

  const tsvContent = csvContent
    .split('\n')
    .map(line => {
      // ダブルクォートを除去し、カンマをタブ（\t）に置換
      return line.replace(/"/g, '').replace(/,/g, '\t');
    })
    .join('\n');

  const tsvDestPath = path.join(__dirname, `../public/sheets/${name}_コピペ用.txt`);
  fs.writeFileSync(tsvDestPath, tsvContent, 'utf8');
  console.log(`Successfully generated ${name} TSV for copy-paste!`);
});
