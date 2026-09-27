/**
 * makes every user-facing string in assets/app.js editable from config.js.
 * run:  npm run patch
 *
 * WHY THIS EXISTS
 * assets/app.js is a minified build. most of its text already lives in one
 * config object (Dt), but a handful of strings were written straight into
 * components, so no amount of editing config.js could change them. each
 * entry below rewrites one of those literals to read from Dt instead.
 *
 * `Dt` is a module-level const, so it is in scope inside every component —
 * that is why we can point at it directly instead of threading new props
 * through minified destructuring signatures.
 *
 * SAFEGUARDS
 *   - every `find` must match exactly `count` times, or nothing is written
 *   - if `find` is gone but `replace` is already there, the patch is a no-op
 *     (so running this twice is safe)
 *   - the result is syntax-checked before it replaces the file on disk
 *   - the file is only written if every single patch succeeded
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(root, 'assets/app.js');

/* s(n) = "at least this many items" guard for the story array */
const s = (n) => `Dt.ui.story?.[${n}]?.text`;
const l = (n) => `Dt.ui.story?.[${n}]?.label`;

const PATCHES = [
  /* ---------- login screen ---------- */
  {
    what: 'login: input placeholder',
    find: 'placeholder:"أدخل كلمة المرور"',
    replace: 'placeholder:Dt.login.placeholder',
  },
  {
    what: 'login: caption under the lock',
    find: 'children:"محفوظ بكل حب"',
    replace: 'children:Dt.login.caption',
  },

  /* ---------- music control ---------- */
  {
    what: 'music button: loading label',
    find: 'children:"بحبك"',
    replace: 'children:Dt.loading.musicText',
  },
  {
    what: 'header: brand text',
    find: 'children:"قصتنا 🤍"',
    replace: 'children:Dt.ui.brand',
  },

  /* ---------- the letter (after opening the envelope) ---------- */
  {
    what: 'letter: heading',
    find: 'children:"إلى نصفي الآخر ودنيتي.. ✨"',
    replace: 'children:Dt.envelope.letterTitle',
  },
  {
    what: 'letter: sign-off line',
    find: 'children:"رسالة خاصة من القلب"',
    replace: 'children:Dt.envelope.letterNote',
  },

  /* ---------- milestones ---------- */
  {
    what: 'milestones: line under the timeline',
    find: 'children:"وتبقى الحكاية مستمرة"',
    replace: 'children:Dt.milestones.note',
  },

  /* ---------- the animated maze scene ---------- */
  {
    what: 'maze: eyebrow line',
    find: 'children:"— مشوارنا مع بعض"',
    replace: 'children:Dt.ui.mazeEyebrow',
  },
  {
    what: 'maze: section title',
    find: 'children:"لعبة المتاهة"',
    replace: 'children:Dt.ui.mazeTitle',
  },
  {
    what: 'maze: play button label',
    find: 'children:"🎮 العب المتاهة"',
    replace: 'children:Dt.ui.mazeButton',
  },
  {
    what: 'maze: play button hint',
    find: 'children:"اضغطي عشان توصلي لقلبي 🎯"',
    replace: 'children:Dt.ui.mazeButtonHint',
  },
  {
    what: 'maze: walking character name tag',
    find: 'children:"He"',
    replace: 'children:Dt.couple.his',
  },
  {
    what: 'maze: story beat 1 (meeting)',
    find: 'c("في يوم مشمس من أيام مايو، بدأنا نتعرف على بعض","— البداية —")',
    replace: `c(${s(0)},${l(0)})`,
  },
  {
    what: 'maze: story beat 2 (the café)',
    find: 'c("بعد خمسة أيام، التقينا في كافيه صغير وشربنا قهوة وضحكنا","— الكافيه —")',
    replace: `c(${s(1)},${l(1)})`,
  },
  {
    what: 'maze: story beat 3 (the meeting)',
    find: 'c("تمشّينا معاً، وتبادلنا الهدايا والذكريات الجميلة","— اللقاء —")',
    replace: `c(${s(2)},${l(2)})`,
  },
  {
    what: 'maze: story beat 4 (the happiness)',
    find: 'c("ضحكنا طويلًا ومضت الليالي معنا، والأبدية تنتظرنا","— السعادة —")',
    replace: `c(${s(3)},${l(3)})`,
  },
  {
    what: 'maze: story beat 5 (the goodbye)',
    find: 'c("وعادتها إلى بيتها، وبقينا معًا إلى الآن وإلى الأبد 💕","— الخاتمة —")',
    replace: `c(${s(4)},${l(4)})`,
  },

  /* ---------- the counter ---------- */
  {
    what: 'counter: first note line',
    find: 'children:"أول يوم واحنا معا بعض — ١٢-١-٢٠٢٦"',
    replace: 'children:Dt.ui.timerNote?.[0]',
  },
  {
    what: 'counter: second note line',
    find: 'children:"أول يوم حبيتك بجد — ١٢-١-٢٠٢٦"',
    replace: 'children:Dt.ui.timerNote?.[1]',
  },

  /* ---------- the ending screen ---------- */
  {
    what: 'ending: small caps label',
    find: 'children:"نهاية الموقع"',
    replace: 'children:Dt.ui.endLabel',
  },

  /* ---------- neutral system text: units and accessible names ---------- */
  {
    what: 'counter: unit names (years / days / hours / minutes)',
    find:
      'const r=[{label:"سنوات",value:n.years,color:"text-rose-400",border:"border-rose-900/30"},' +
      '{label:"أيام",value:n.days,color:"text-rose-300",border:"border-rose-900/30"},' +
      '{label:"ساعات",value:n.hours,color:"text-rose-200",border:"border-rose-900/30"},' +
      '{label:"دقائق",value:n.minutes,color:"text-rose-200",border:"border-rose-900/30"}]',
    replace:
      'const r=[{label:Dt.ui.timeUnits?.[0],value:n.years,color:"text-rose-400",border:"border-rose-900/30"},' +
      '{label:Dt.ui.timeUnits?.[1],value:n.days,color:"text-rose-300",border:"border-rose-900/30"},' +
      '{label:Dt.ui.timeUnits?.[2],value:n.hours,color:"text-rose-200",border:"border-rose-900/30"},' +
      '{label:Dt.ui.timeUnits?.[3],value:n.minutes,color:"text-rose-200",border:"border-rose-900/30"}]',
  },
  {
    what: 'counter: seconds unit',
    find: '})," ثواني"]',
    replace: '}),Dt.ui.timeUnits?.[4]]',
  },
  {
    what: 'music button: accessible names',
    find: 'title:h?"إيقاف الموسيقى":"تشغيل الموسيقى"',
    replace: 'title:h?Dt.ui.musicPause:Dt.ui.musicPlay',
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

/* never write a bundle that cannot parse */
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
  console.log(
    `\n${applied} applied, ${already} already done. backup: assets/app.js.bak`
  );
}
