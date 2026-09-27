/**
 * regenerates the app's built-in config (const Dt = {...} inside
 * assets/app.js) from config.js.
 * run:  npm run sync:bundle
 *
 * WHY
 * the app needs a working set of defaults even when config.js is missing
 * or broken — that's what the deep-merge shim falls back to. those defaults
 * live inside the minified bundle, which means they can silently drift away
 * from the file you actually edit. this tool removes that second source of
 * truth: config.js always wins, and the bundle is just a generated copy.
 *
 * SAFE
 *   - exits without writing if config.js cannot be evaluated
 *   - only touches the Dt object, never the rest of the bundle
 *   - syntax-checks the result before replacing the file
 *   - keeps a .bak of the previous bundle
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(root, 'config.js');
const BUNDLE = join(root, 'assets/app.js');

/* ---------- 1. read config.js ---------- */
const cfgSrc = readFileSync(CONFIG, 'utf8');
const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
try {
  vm.createContext(sandbox);
  vm.runInContext(cfgSrc, sandbox, { filename: 'config.js' });
} catch (err) {
  console.error('config.js has a syntax error — nothing was written:\n  ' + err.message);
  process.exit(1);
}
const cfg = sandbox.window.APP_CONFIG;
if (!cfg || typeof cfg !== 'object') {
  console.error('config.js did not set window.APP_CONFIG — nothing was written');
  process.exit(1);
}

/* ---------- 2. serialise it the way the bundle writes it ---------- */
const isPlainObject = (v) =>
  Object.prototype.toString.call(v) === '[object Object]';
/* cross-realm safe: values evaluated inside a vm context are NOT instances
   of this realm's Date, so instanceof would silently return false */
const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';

function serialise(value, indent = '') {
  if (isDate(value)) {
    /* Emit local components, never toISOString().
       new Date("2026-01-12T00:00:00") means local midnight, and so does
       new Date(2026, 0, 12) — but an ISO string would mean UTC midnight and
       silently move the counter by a day for anyone east or west of GMT. */
    return (
      `new Date(${value.getFullYear()},${value.getMonth()},${value.getDate()}` +
      `,${value.getHours()},${value.getMinutes()},${value.getSeconds()},${value.getMilliseconds()})`
    );
  }
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const inner = value.map((v) => serialise(v, indent)).join(',');
    return '[' + inner + ']';
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    const parts = keys.map(
      (k) => `${indent}${JSON.stringify(k)}:${serialise(value[k], indent)}`
    );
    return `{${parts.join(',')}}`;
  }
  if (typeof value === 'function') {
    throw new Error('config.js must not contain functions');
  }
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}

let body;
try {
  body = serialise(cfg);
} catch (err) {
  console.error('cannot serialise config.js — nothing was written:\n  ' + err.message);
  process.exit(1);
}

/* ---------- 3. splice it into the bundle ---------- */
const bundle = readFileSync(BUNDLE, 'utf8');
const decl = bundle.indexOf('const Dt={');
if (decl < 0) {
  console.error('could not find "const Dt={" in assets/app.js');
  process.exit(1);
}
const open = bundle.indexOf('{', decl);
let depth = 0;
let close = -1;
for (let i = open; i < bundle.length; i++) {
  const ch = bundle[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) {
      close = i;
      break;
    }
  }
  /* a string literal can contain braces — skip over it */
  else if (ch === '"' || ch === "'" || ch === '`') {
    const quote = ch;
    i++;
    while (i < bundle.length && bundle[i] !== quote) {
      if (bundle[i] === '\\') i++;
      i++;
    }
  }
}
if (close < 0) {
  console.error('the Dt object in assets/app.js is not closed');
  process.exit(1);
}

const next = bundle.slice(0, open) + body + bundle.slice(close + 1);

try {
  new vm.Script(next, { filename: 'app.js' });
} catch (err) {
  console.error('the rewritten bundle does not parse, nothing was written:\n  ' + err.message);
  process.exit(1);
}

if (next === bundle) {
  console.log('assets/app.js defaults already match config.js');
} else {
  copyFileSync(BUNDLE, BUNDLE + '.bak');
  writeFileSync(BUNDLE, next, 'utf8');
  const before = close - open + 1;
  console.log(
    `bundle defaults synced from config.js  (${before} → ${body.length} bytes)`
  );
}
