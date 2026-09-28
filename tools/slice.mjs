/** print a slice of assets/app.js straight to a file, utf8 safe */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [needle, before, after, out] = process.argv.slice(2);
const src = readFileSync(join(root, 'assets/app.js'), 'utf8');
const i = src.indexOf(needle);
if (i === -1) {
  console.error('needle not found');
  process.exit(1);
}
const slice = src.slice(Math.max(0, i - Number(before)), i + Number(after));
const dest = join(process.env.TEMP || '.', out || 'slice.txt');
writeFileSync(dest, slice, 'utf8');
console.log('needle at', i, '-> wrote', dest, `(${slice.length} chars)`);
