/**
 * structural fixes to assets/app.js that config.js cannot express.
 * run:  npm run patch:structure
 *
 * WHY THIS EXISTS
 * `patch-strings.mjs` moves text into config.js. these are the three cases
 * that are not about text at all — they are about *behaviour* the built
 * bundle got wrong (or got right for a date that no longer applies), and
 * fixing them means editing the minified code itself.
 *
 *   1. the envelope subtitle <p> rendered even when the subtitle was blank,
 *      leaving a 12px hole between the title rule and the button
 *   2. the counter's leading unit was a 365.25-day YEAR, so any start date
 *      less than a year ago displayed "0 سنوات". the anniversary is in
 *      Ramadan 1447, which is ~7 months back, so the leading unit has to be
 *      a MONTH. the tile labels already come from config.js (ui.timeUnits),
 *      so only the arithmetic and the field name had to change here.
 *
 * SAFEGUARDS (same contract as patch-strings.mjs)
 *   - every `find` must match exactly `count` times, or nothing is written
 *   - if `find` is gone but `replace` is already there, it is a no-op
 *   - the result is syntax-checked before it replaces the file on disk
 *   - a .bak of the previous bundle is kept
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(root, 'assets/app.js');

/* mean Gregorian month, the same divisor a real calendar uses */
const YEAR = '1e3*60*60*24*365.25';
const MONTH = '1e3*60*60*24*30.4375';

const PATCHES = [
  {
    /* the closing line above the "اقفلها" button. it is optional, and a
       blank string must collapse instead of leaving an `mb-6` hole.
       note the children is `l.footerText` here, not `t` — this one lives in
       the main component, where the config was destructured into `l`. */
    what: 'footer: a blank closing line must not create the <p> at all',
    /* the <p> is the FIRST child of the footer's children array, so it is
       preceded by `[` and not by `,` — matching on the comma finds nothing. */
    find:
      '[i.jsx("p",{className:"text-rose-200/70 font-light text-sm max-w-xs mx-auto mb-6 relative z-10",children:l.footerText})',
    replace:
      '[l.footerText&&i.jsx("p",{className:"text-rose-200/70 font-light text-sm max-w-xs mx-auto mb-6 relative z-10",children:l.footerText})',
  },
  {
    /* same rule as the envelope, for the section header (gallery / video /
       timer / milestones all share this component). blanking any section's
       subtitle must not leave the `mt-1` hole under its title. */
    what: 'section header: a blank subtitle must not create the <p> at all',
    find:
      ',i.jsx("p",{className:"text-rose-400/50 text-xs mt-1 font-light tracking-wide",children:t})',
    replace:
      ',t&&i.jsx("p",{className:"text-rose-400/50 text-xs mt-1 font-light tracking-wide",children:t})',
  },
  {
    /* `children:t||null` is NOT enough: React still creates the <p> element,
       it just has no children, so the `mt-3` margin still reserves the gap.
       the element itself has to be conditional. `t&&i.jsx(...)` evaluates to
       `false` for a blank subtitle, and React drops a false child entirely.

       the full className is part of the match on purpose: "tracking-wide"
       alone also matches the login screen's caption <p>, and patching that
       one would blank the "محفوظ بأمان" line too. */
    what: 'envelope: a blank subtitle must not create the <p> at all',
    find:
      ',i.jsx("p",{className:"mt-3 text-xs sm:text-sm text-rose-400/70 font-light tracking-wide",children:t})',
    replace:
      ',t&&i.jsx("p",{className:"mt-3 text-xs sm:text-sm text-rose-400/70 font-light tracking-wide",children:t})',
  },

  /* ---------- the counter: leading unit years -> months ---------- */
  {
    what: 'counter: leading unit is whole months, not years',
    find: `s=Math.floor(o/(${YEAR}))`,
    replace: `s=Math.floor(o/(${MONTH}))`,
  },
  {
    what: 'counter: leftover days measured against the month, not the year',
    find: `a=Math.floor(o%(${YEAR})/(1e3*60*60*24))`,
    replace: `a=Math.floor(o%(${MONTH})/(1e3*60*60*24))`,
  },
  {
    what: 'counter: initial state field renamed to months',
    find: 'useState({years:0,days:0',
    replace: 'useState({months:0,days:0',
  },
  {
    what: 'counter: emitted field renamed to months',
    find: 'n({years:s,days:a',
    replace: 'n({months:s,days:a',
  },
  {
    what: 'counter: the leading tile reads the months field',
    find: 'value:n.years,color:"text-rose-400"',
    replace: 'value:n.months,color:"text-rose-400"',
  },
];

const src = readFileSync(BUNDLE, 'utf8');
let out = src;
let applied = 0;
let already = 0;
const failed = [];

for (const p of PATCHES) {
  const found = out.split(p.find).length - 1;
  if (found === 1) {
    out = out.replace(p.find, p.replace);
    applied++;
    console.log(`  applied  ${p.what}`);
  } else if (found === 0 && out.includes(p.replace)) {
    already++;
    console.log(`  skipped  ${p.what}  (already done)`);
  } else {
    failed.push(`${p.what}\n           expected 1 match, found ${found}\n           looking for: ${p.find}`);
    console.log(`  FAILED   ${p.what}  (found ${found})`);
  }
}

if (failed.length) {
  console.error(`\n${failed.length} patch(es) failed — assets/app.js was NOT modified:\n`);
  for (const f of failed) console.error('  - ' + f);
  process.exit(1);
}

try {
  new vm.Script(out, { filename: 'app.js' });
} catch (err) {
  console.error('\nthe patched bundle does not parse, nothing was written:\n  ' + err.message);
  process.exit(1);
}

if (out === src) {
  console.log(`\nnothing to do — all ${PATCHES.length} patches were already applied.`);
} else {
  copyFileSync(BUNDLE, BUNDLE + '.bak');
  writeFileSync(BUNDLE, out, 'utf8');
  console.log(`\n${applied} applied, ${already} already done. backup: assets/app.js.bak`);
}
