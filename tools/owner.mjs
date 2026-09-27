/** prints the function that contains a byte offset. run: node tools/owner.mjs <offset> */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'assets/app.js'), 'utf8');
const at = Number(process.argv[2]);

/* walk back to the nearest top-level "function X(" or "const X=" at depth 0 */
let depth = 0;
let start = 0;
for (let i = 0; i < at; i++) {
  const c = src[i];
  if (c === '{' || c === '(' || c === '[') depth++;
  else if (c === '}' || c === ')' || c === ']') depth--;
  else if (depth === 0 && src.startsWith('function ', i)) start = i;
}
const head = src.slice(start, start + 120).split('(')[0];
console.log(`offset ${at} lives in: ${head}`);
process.stdout.write(src.slice(start, Math.min(src.length, start + 1500)) + '\n');
