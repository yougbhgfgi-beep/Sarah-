/**
 * shows where the leftover words sit inside assets/app.js, with context.
 * run:  node tools/where.mjs <word> [word2 ...]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'assets/app.js'), 'utf8');
const cfgStart = src.indexOf('const Dt={');

for (const word of process.argv.slice(2)) {
  console.log(`\n===== "${word}" =====`);
  let i = -1, n = 0;
  while ((i = src.indexOf(word, i + 1)) !== -1) {
    n++;
    const where = i < cfgStart ? 'COMPONENT (hardcoded)' : 'bundle config (fallback)';
    const from = Math.max(0, i - 130);
    console.log(`\n[${n}] @${i} — ${where}`);
    console.log('    …' + src.slice(from, i + word.length + 130).replace(/\n/g, ' ') + '…');
  }
  if (!n) console.log('  not found');
}
