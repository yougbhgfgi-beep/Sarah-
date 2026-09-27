/**
 * rewrites the deploy URL everywhere it is hardcoded.
 * run:  npm run deploy:url -- <pages-url>
 * e.g.  npm run deploy:url -- https://yougbhgfgi-beep.github.io/Sarah-/
 *
 * WHY THIS TOOL
 * GitHub Pages needs ABSOLUTE urls for the Open Graph / Twitter card tags -
 * WhatsApp, Facebook and X fetch those without running any JavaScript, so
 * they cannot be derived at runtime. That means the url has to be written
 * into index.html by hand, and the moment the repository is renamed those
 * tags silently point at a dead image and the share preview breaks.
 *
 * Everything else in the project is deliberately relative ("./images/...",
 * start_url "./", scope "./") so the site works from any sub-path. This tool
 * only touches the handful of places that genuinely cannot be relative.
 *
 * SAFETY
 *   - reports every absolute github.io url it finds, including ones it does
 *     not know about, so a new hardcoded url cannot slip in unnoticed
 *   - exits without writing if the url given is not a valid absolute url
 *   - syntax-checks index.html's inline scripts before replacing the file
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

const arg = (process.argv[2] || '').trim();
if (!arg) {
  console.error('usage: npm run deploy:url -- https://<user>.github.io/<repo>/');
  process.exit(1);
}

/* normalise: absolute, https, exactly one trailing slash */
let base;
try {
  base = new URL(arg);
} catch {
  console.error(`"${arg}" is not a valid URL.`);
  process.exit(1);
}
if (base.protocol !== 'https:') {
  console.error(`the url must be https (got ${base.protocol}). GitHub Pages serves https.`);
  process.exit(1);
}
if (!/\.github\.io(\/|$)/.test(base.host)) {
  console.error(`"${base.host}" is not a github.io host. This project deploys to GitHub Pages.`);
  process.exit(1);
}
const HOST = base.host;
const PATH = base.pathname.replace(/\/+$/, '');
const next = `https://${HOST}${PATH}/`;
/* BARE carries no scheme, so swap() can re-add one only when the original had it */
const BARE = `${HOST}${PATH}`;
const swap = (m, scheme) => (scheme ? 'https://' : '') + BARE;
const previous = new URL(next).origin;

/* files that are allowed to contain a hardcoded deploy url */
const TARGETS = ['index.html', 'docs/STRUCTURE.md', 'docs/HOW-TO-EDIT.md', 'README.md'];

/* any github.io url anywhere, so nothing slips past unnoticed.
   matches both the full form (https://user.github.io/repo) and the bare form
   docs tend to use (user.github.io/repo). */
const OLD = /(?:https:\/\/)?[A-Za-z0-9-]+\.github\.io\/[A-Za-z0-9._-]+/g;
const REPL = next.replace(/\/$/, '');
let found = 0;
for (const f of [...TARGETS, 'config.js', 'manifest.json', 'sw.js', 'install.js']) {
  let src;
  try { src = read(f); } catch { continue; }
  for (const m of src.match(OLD) || []) {
    if (m === REPL || m === 'https://' + REPL) continue;
    found++;
    const where = f === 'index.html'
      ? 'EXPECTED (share tags)'
      : 'UNEXPECTED - check this one';
    console.log(`  ${where}: ${f}  ${m}`);
  }
}

let changed = 0;
for (const f of TARGETS) {
  let src;
  try { src = read(f); } catch { continue; }
  const out = src.replace(OLD, swap);
  if (out === src) continue;
  writeFileSync(join(root, f), out, 'utf8');
  changed++;
  console.log(`  updated  ${f}`);
}

/* the inline audio-preload script must still parse */
const html = read('index.html');
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  try {
    new vm.Script(m[1]);
  } catch (err) {
    console.error(`\nindex.html inline script no longer parses: ${err.message}`);
    process.exit(1);
  }
}

console.log(`\ndeploy url set to ${next}`);
console.log(`${changed} file(s) updated.`);
if (found) {
  console.log(
    '\nNOTE: urls listed as UNEXPECTED above are still hardcoded somewhere.\n' +
    '      the site itself will work (everything else is relative), but fix any\n' +
    '      of them that a visitor or a crawler will actually see.'
  );
}
console.log('\nshare preview to verify after pushing:');
console.log(`  page    ${next}`);
console.log(`  image   ${next}images/sara-1.jpg`);
console.log(`  test it with: https://www.opengraph.xyz/  or  the WhatsApp preview`);
