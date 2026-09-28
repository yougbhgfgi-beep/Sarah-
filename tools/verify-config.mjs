/**
 * sanity check: does config.js actually reach the app config?
 * run:  node tools/verify-config.mjs
 *
 * it loads the real default config out of the built bundle, applies the
 * same merge the bundle applies, then checks the override landed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { findAsserted } from './negation.mjs';

/* the same list tools/audit-content.mjs uses — one source of truth */
const ROMANCE_WORDS = ['بحبك', 'أحبك', 'حبيبك', 'حبيبتي', 'عشيق'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

/* 1. config.js in a fake browser */
const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(read('config.js'), sandbox, { filename: 'config.js' });
const override = sandbox.window.APP_CONFIG;

/* 2. the merge, byte-for-byte the one injected in assets/app.js */
const bundle = read('assets/app.js');
const SHIM_START = 'const __o=v=>';
const SHIM_END = 'if(window.APP_CONFIG)__m(Dt,window.APP_CONFIG);';
const a = bundle.indexOf(SHIM_START);
const b = bundle.indexOf(SHIM_END);
if (a < 0 || b < 0) {
  console.error('FAIL: merge shim not found in assets/app.js');
  process.exit(1);
}
const shim = bundle.slice(a, b + SHIM_END.length);
const mergeFn = vm.runInNewContext(
  `((function(){${shim.replace('if(window.APP_CONFIG)', 'if(false)')}return __m})())`
);

/* 3. the app's real defaults, straight out of the bundle */
const src = read('assets/app.js');
const start = src.indexOf('const Dt=');
const brace = src.indexOf('{', start);
let depth = 0, end = brace;
for (let i = brace; i < src.length; i++) {
  const c = src[i];
  if (c === '{') depth++;
  else if (c === '}' && --depth === 0) { end = i; break; }
}
const defaults = vm.runInNewContext(`(${src.slice(brace, end + 1)})`);

/* 4. apply the override on top */
mergeFn(defaults, override);

/* 5. checks */
// note: toString, not instanceof — the override Date comes from another
// vm realm, and cross-realm instanceof is always false.
const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';

/** every string in the merged config, flattened, so a check can scan them all */
function allCopy(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(allCopy).join('\n');
  if (value && typeof value === 'object' && !isDate(value)) {
    return Object.values(value).map(allCopy).join('\n');
  }
  return '';
}

/**
 * The site is written to exactly one reader: a woman. These tokens are
 * unambiguously masculine *second person* — the exact way a masculine line
 * sneaks into copy that is otherwise feminine. Note the pairs: انت/إنتي,
 * ادخل/ادخلي, اكتب/اكتبي, افتح/افتحي, اقرا/اقري, and — the one that is easy
 * to get backwards in colloquial Arabic — يستاهل/تستاهل.
 *
 * The boundary lookarounds use the Arabic letter range, not \b, because \b is
 * defined on ASCII word characters and would not fire between two Arabic
 * letters. That is what keeps "إنتي" and "تستاهلي" from matching.
 */
const MASCULINE_SECOND_PERSON =
  /(?<![ء-ي])(انت|إنت|ادخل|اكتب|افتح|اضغط|اقرا|أقرأ|يستاهل)(?![ء-ي])/g;
const masculineHits = (copy) => [...new Set(copy.match(MASCULINE_SECOND_PERSON) || [])];

/** and where they are, so a failure names the line instead of just the rule */
function masculineReport(value, path = '') {
  if (typeof value === 'string') {
    const hits = masculineHits(value);
    return hits.length ? [`${path} → ${hits.join(' / ')}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => masculineReport(v, `${path}[${i}]`));
  }
  if (value && typeof value === 'object' && !isDate(value)) {
    return Object.entries(value).flatMap(([k, v]) => masculineReport(v, path ? `${path}.${k}` : k));
  }
  return [];
}
const masculineHitList = masculineReport(defaults);
if (masculineHitList.length) {
  console.log('  masculine wording, one day after the edit:');
  for (const line of masculineHitList) console.log('    ' + line);
}

const checks = [
  ['dates stay Date objects', isDate(defaults.anniversaryDate)],
  ['date value preserved', defaults.anniversaryDate.getFullYear() === 2026],
  ['login section intact (not wiped)', typeof defaults.login?.errorText === 'string'],
  ['nested merge kept siblings',
    defaults.login.title === override.login.title &&
    typeof defaults.login.loadingText === 'string'],
  ['gallery array replaced as a unit', Array.isArray(defaults.gallery) && defaults.gallery.length === 4],
  ['gallery images resolve to real files',
    defaults.gallery.every((g) => read('.' + g.src.replace('./', '/')) !== undefined)],
  /* compared against config.js rather than a literal, so rewriting the
     letter can never turn this into a test that fails for no reason */
  ['ending message came through the merge intact',
    defaults.ending.message === override.ending.message],
  /* structural, not a count: the timeline is a field the user edits freely
     (entries get added and removed), so pinning a length here would fail
     the suite every time he changes the content. what the component
     actually needs is that every entry still has the three keys it reads. */
  ['milestones events are well-formed',
    Array.isArray(defaults.milestones.events) &&
    defaults.milestones.events.length >= 2 &&
    defaults.milestones.events.every(
      (e) => e && e.date?.trim() && e.label?.trim() && e.description?.trim()
    )],
  ['password is read from config.js', defaults.login.password === 'love'],

  /* the ui section feeds text that used to be hardcoded in components —
     the bundle reads it via Dt.ui.*, so a wrong shape breaks the render */
  ['ui section survived the merge', typeof defaults.ui === 'object' && defaults.ui !== null],
  ['ui.story has 5 beats', Array.isArray(defaults.ui?.story) && defaults.ui.story.length === 5],
  ['every story beat has text and a label',
    Array.isArray(defaults.ui?.story) &&
      defaults.ui.story.every((b) => typeof b?.text === 'string' && b.text && typeof b?.label === 'string' && b.label)],
  ['ui.timerNote has 2 lines', Array.isArray(defaults.ui?.timerNote) && defaults.ui.timerNote.length === 2],
  ['ui.timeUnits has 5 units', Array.isArray(defaults.ui?.timeUnits) && defaults.ui.timeUnits.length === 5],
  ['ui plain strings are non-empty',
    ['brand', 'gameEyebrow', 'gameTitle', 'gameButton', 'gameButtonHint', 'endLabel', 'musicPlay', 'musicPause']
      .every((k) => typeof defaults.ui?.[k] === 'string' && defaults.ui[k].trim().length > 0)],
  ['letter heading and sign-off present',
    typeof defaults.envelope?.letterTitle === 'string' &&
      typeof defaults.envelope?.letterNote === 'string'],
  ['login placeholder and caption present',
    typeof defaults.login?.placeholder === 'string' &&
      typeof defaults.login?.caption === 'string'],
  /* the site is about admiration, not a love confession, so an assertive
     "بحبك" must never appear. but a NEGATED one is the opposite of a
     confession and the letter says it on purpose ("ولا أدّعي إني بحبك").
     dropping the check was not an option — it is the one rule that keeps the
     tone honest — so each hit is read in context and only a confession that
     is actually being asserted fails. see tools/negation.mjs. */
  ...(() => {
    const text = JSON.stringify(defaults);
    const asserted = findAsserted(text, ROMANCE_WORDS);
    return [[
      'no *asserted* love-confession wording anywhere in the config',
      asserted.length === 0,
      asserted.length ? asserted.map((a) => `"${a.word}" x${a.count} — ${a.sample}`).join(' | ') : '',
    ]];
  })(),

  /* ---- everything on this site is addressed to one person: a woman ----
     the tokens are unambiguously masculine second-person forms. "انت",
     "ادخل", "اكتب" and friends are the exact way a masculine line sneaks
     into copy that is otherwise feminine — so they are banned outright. */
  ['every line addressed to her is feminine',
    masculineHitList.length === 0],
];

/* ---------- 6. the exact expressions the bundle evaluates ----------
   static proof that every `Dt.<path>` the patched components read resolves
   to a real, non-empty value. this matters most for ui.story: the animated
   scene in the main page never leaves its "idle" state in this build (its
   setter is never called), so the beats are wired but dormant — a typo
   there would stay invisible until someone restores the animation. */
const componentCode = src.slice(0, start);
const refs = [...new Set([...componentCode.matchAll(/\bDt((?:\.[A-Za-z_$][\w$]*)+)/g)].map((m) => m[1]))];
const broken = [];
for (const path of refs) {
  const parts = path.slice(1).split('.');
  let cur = defaults;
  let ok = true;
  for (const seg of parts) {
    if (cur == null || typeof cur !== 'object' || !(seg in cur)) { ok = false; break; }
    cur = cur[seg];
  }
  /* an array index resolves to the array; the value behind it is checked
     by the per-item assertions above */
  if (ok && typeof cur === 'string' && !cur.trim()) ok = false;
  if (!ok) broken.push('Dt' + path);
}
checks.push([
  `every Dt.* the components read resolves (${refs.length} refs)`,
  broken.length === 0,
]);
if (broken.length) console.log('  broken refs: ' + broken.join(', '));

let bad = 0;
for (const [name, ok] of checks) {
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`\n${checks.length - bad}/${checks.length} passed`);
process.exit(bad ? 1 : 0);
