/** dump a window of the bundle around a byte offset. run: node tools/dump.mjs <offset> [before] [after] */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'assets/app.js'), 'utf8');

const at = Number(process.argv[2]);
const before = Number(process.argv[3] ?? 800);
const after = Number(process.argv[4] ?? 800);
process.stdout.write(src.slice(Math.max(0, at - before), at + after) + '\n');
