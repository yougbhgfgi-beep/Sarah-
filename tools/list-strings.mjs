/**
 * every Arabic string literal in assets/app.js, with context.
 * run:  node tools/list-strings.mjs [--all]
 *
 * by default it only prints literals that are user-facing (JSX children,
 * labels, placeholders). --all prints every one, including the app's
 * bundled config defaults, so nothing hides.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'assets/app.js'), 'utf8');
const cfgStart = src.indexOf('const Dt={');

const ARABIC = /[؀-ۿ]/;
const showAll = process.argv.includes('--all');

/* positions that can be user-facing */
const FACING = [
  'children', 'alt', 'aria-label', 'placeholder', 'title', 'text', 'subtitle',
  'loadingText', 'errorText', 'buttonText', 'exitText', 'href', 'label',
  'description', 'date', 'caption', 'name', 'message', 'hint', 'value',
];

const hits = [];
const re = /"((?:[^"\\]|\\.)*)"/g;
let m;
while ((m = re.exec(src))) {
  const raw = m[1];
  if (!ARABIC.test(raw)) continue;
  const at = m.index;
  /* what key is this literal assigned to? look back a little */
  const before = src.slice(Math.max(0, at - 40), at);
  const keyMatch = before.match(/([A-Za-z_$][\w$]*)\s*:\s*$/);
  const key = keyMatch ? keyMatch[1] : null;
  hits.push({ at, value: raw, key, inConfig: at >= cfgStart });
}

let n = 0;
for (const h of hits) {
  if (h.inConfig && !showAll) continue;
  if (!showAll && h.key && !FACING.includes(h.key)) continue;
  n++;
  const where = h.inConfig ? 'config default' : 'HARDCODED';
  const flag = h.inConfig ? ' ' : '!';
  console.log(
    `${flag}[${String(n).padStart(3)}] @${h.at} ${where} ${h.key ? `key=${h.key}` : '(no key)'}\n      ${JSON.stringify(h.value)}`
  );
}
console.log(`\n${n} literal(s) shown. ${hits.filter((h) => !h.inConfig).length} are outside the config object.`);
