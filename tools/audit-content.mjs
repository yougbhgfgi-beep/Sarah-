/**
 * content audit — catches leftovers from an earlier version of the site.
 * run:  npm run audit
 *
 * the app's text lives in two places that must never drift apart:
 *   1. config.js        — what you edit
 *   2. assets/app.js    — the bundled defaults, used if config.js ever fails
 * and a few words can also be hardcoded inside components, which no config
 * change can reach. this checks all three.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { findAsserted } from './negation.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

/* words from the previous version of this site — none of these should survive */
const STALE_WORDS = [
  'بحبك', 'حبنا', 'حبيبك', 'جميل', 'جودي', 'حبيبتي', 'أجمل قصة',
  'عشيق', 'قلبي ليكي', 'حبك', 'حب العمر', 'قصة حبنا', 'حبنا الأبدية',
  'Jj12', 'Maak_Alby', 'photo-1', 'photo-2', 'photo-3', 'photo-4', 'photo-5', 'photo-6',
  'icon-heart', 'ending-bg', 'index-new', 'index-DtXZcElU',
];

/* love-confession wording is the whole point of avoiding here */
const ROMANCE_WORDS = ['بحبك', 'أحبك', 'حبيبتي', 'عشانك', 'قلبي ليكي'];

const problems = [];
const note = (file, word, where) =>
  problems.push(`${file}${where} — "${word}"`);

/* ---------- 1. the app's bundled defaults ---------- */
const bundle = read('assets/app.js');
const cfgStart = bundle.indexOf('const Dt={');
if (cfgStart < 0) {
  console.error('could not find the config object in assets/app.js');
  process.exit(1);
}
const brace = bundle.indexOf('{', cfgStart);
let depth = 0, end = brace;
for (let i = brace; i < bundle.length; i++) {
  if (bundle[i] === '{') depth++;
  else if (bundle[i] === '}' && --depth === 0) { end = i; break; }
}
const bundleCfgSrc = bundle.slice(brace, end + 1);
const bundleCfg = vm.runInNewContext(`(${bundleCfgSrc})`);

/* the bundled defaults are prose, so a negated "بحبك" is fine there */
for (const { word, count } of findAsserted(bundleCfgSrc, STALE_WORDS)) {
  note('assets/app.js (defaults)', word, ` x${count}`);
}

/* ---------- 2. strings hardcoded in components (unreachable by config) ---------- */
const componentCode = bundle.slice(0, cfgStart);
for (const { word, count } of findAsserted(componentCode, STALE_WORDS.concat(ROMANCE_WORDS))) {
  note('assets/app.js (hardcoded in a component)', word, ` x${count}`);
}

/* ---------- 2b. no Arabic string may live in a component at all ----------
   the whole point of the patch tool is that config.js is the only place
   with words in it. this catches anything that slipped through. */
const ARABIC = /[؀-ۿ]/;
const literalRe = /"((?:[^"\\]|\\.)*)"/g;
let lit;
const orphans = new Set();
while ((lit = literalRe.exec(componentCode))) {
  if (!ARABIC.test(lit[1])) continue;
  orphans.add(lit[1].slice(0, 40));
}
if (orphans.size) {
  for (const o of orphans) {
    note('assets/app.js (Arabic text baked into a component)', o, ' — move it to config.js');
  }
}

/* ---------- 2c. every Dt.<key> the components read must exist ----------
   guards the patch tool: a typo in a patch would otherwise throw at render
   time and take the whole site down for a visitor. */
const refs = new Set();
const refRe = /\bDt((?:\.[A-Za-z_$][\w$]*)+)/g;
let ref;
while ((ref = refRe.exec(componentCode))) {
  const path = ref[1].slice(1).split('.');
  let cur = bundleCfg;
  let ok = true;
  for (const seg of path) {
    /* strip an array index — we only check the container exists */
    if (/^\d+$/.test(seg)) break;
    if (cur == null || typeof cur !== 'object' || !(seg in cur)) {
      ok = false;
      break;
    }
    cur = cur[seg];
  }
  if (!ok) note('assets/app.js', `Dt${ref[1]}`, ' — read by a component but missing from the config');
}

/* ---------- 3. config.js ---------- */
const cfgSrc = read('config.js');
for (const { word, count, sample } of findAsserted(cfgSrc, STALE_WORDS)) {
  note('config.js', word, sample ? ` x${count} — ${sample}` : ` x${count}`);
}
for (const { word, count, sample } of findAsserted(cfgSrc, ROMANCE_WORDS)) {
  note('config.js', word, ` x${count} — asserted love wording${sample ? `: ${sample}` : ''}`);
}

const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(cfgSrc, sandbox, { filename: 'config.js' });
const cfg = sandbox.window.APP_CONFIG;

/* ---------- 4. bundle defaults must match config.js ---------- */
const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';
const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) => {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !isDate(v)) {
      return flat(v, key);
    }
    /* compare Dates by their local wall-clock parts — that is what the app
       actually shows, and it is timezone-independent */
    if (isDate(v)) {
      return [
        [
          key,
          `Date(${v.getFullYear()},${v.getMonth()},${v.getDate()},${v.getHours()},${v.getMinutes()},${v.getSeconds()})`,
        ],
      ];
    }
    return [[key, JSON.stringify(v)]];
  });
const a = Object.fromEntries(flat(bundleCfg));
const b = Object.fromEntries(flat(cfg));
const drift = [];
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
  if (a[k] !== b[k]) drift.push(k);
}
if (drift.length) {
  problems.push(
    `config.js and the bundle defaults disagree on: ${drift.join(', ')}\n` +
      `  → fix with:  npm run sync:bundle`
  );
}

/* ---------- 5. every referenced file must exist ---------- */
import { existsSync } from 'node:fs';
const walk = (v) => {
  const out = [];
  if (typeof v === 'string' && /^\.\/[^?]+\.(jpe?g|png|mp3|mp4|webp|svg)$/i.test(v)) out.push(v);
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  return out;
};
for (const rel of walk(cfg)) {
  if (!existsSync(join(root, rel.replace(/^\.\//, '')))) {
    problems.push(`config.js references a missing file: ${rel}`);
  }
}

/* ---------- report ---------- */
if (!problems.length) {
  console.log('clean — no leftovers, defaults match config.js, all files exist');
  process.exit(0);
}
console.log(`${problems.length} problem(s):\n`);
for (const p of problems) console.log('  - ' + p);
process.exit(1);
