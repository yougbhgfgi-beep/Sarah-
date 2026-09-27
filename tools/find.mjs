/** find a literal in the bundle and print each hit with context. run: node tools/find.mjs <needle> [ctx] */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'assets/app.js'), 'utf8');
const cfgStart = src.indexOf('const Dt={');

const needle = process.argv[2];
const ctx = Number(process.argv[3] ?? 90);
let at = -1, n = 0;
while ((at = src.indexOf(needle, at + 1)) !== -1) {
  n++;
  const where = at >= cfgStart ? 'config-default' : 'HARDCODED';
  const from = Math.max(0, at - ctx);
  const text = src.slice(from, at + needle.length + ctx);
  console.log(`\n[${n}] @${at} ${where}\n  …${text.replace(/\s+/g, ' ')}…`);
}
console.log(`\n${needle}: ${n} hit(s)`);
