import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.join(__dirname, '../public/sheets/エネミーマスタ.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');

const tsvContent = csvContent
  .split('\n')
  .map(line => {
    // ダブルクォートを除去し、カンマをタブ（\t）に置換
    return line.replace(/"/g, '').replace(/,/g, '\t');
  })
  .join('\n');

const tsvDestPath = path.join(__dirname, '../public/sheets/エネミーマスタ_コピペ用.txt');
fs.writeFileSync(tsvDestPath, tsvContent, 'utf8');
console.log('Successfully generated enemy master TSV for copy-paste!');
