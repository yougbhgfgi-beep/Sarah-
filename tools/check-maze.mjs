/**
 * Extracts the inline <script> from maze.html and syntax-checks it with
 * node, so a typo in the game code cannot reach the deployed page.
 * Also greps the deploy files for absolute paths — this project is served
 * from a sub-path (/Sarah-/), so a leading "/" silently breaks a link.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'maze.html'), 'utf8');

/* Comments carry the old values around ("max-height:50vh used to fight it"),
   and a rule must never be satisfied — or broken — by a comment. Strip them
   before testing anything. */
const code = html
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/* ---- the phone rules -------------------------------------------------
   The maze was unplayable on a phone and none of it was a JS bug: the
   layout was. These are the structural rules that make that impossible to
   reintroduce. They are string checks, not layout checks, because jsdom
   reports every offsetHeight as 0 and cannot measure anything.
   -------------------------------------------------------------------- */
const RULES = [
  ['the page can scroll, so nothing can be clipped out of reach',
    /overflow-y:\s*auto/.test(code) && !/overflow:\s*hidden\s*;/.test(code)],
  ['the viewport is measured with dvh, so the phone url bar is not counted',
    /100dvh/.test(code)],
  ['the canvas owns its own size instead of being clamped by a vh max-height',
    !/max-height:\s*\d+(\.\d+)?vh/.test(code)],
  ['a swipe on the canvas moves the player instead of scrolling the page',
    /touch-action:\s*none/.test(code) &&
    /touchmove[\s\S]{0,80}preventDefault/.test(code)],
  ['every navigation out of the maze is relative (the site lives in /Sarah-/)',
    !/location\.href\s*=\s*['"`]\//.test(code)],
  ['the d-pad buttons have a touch-sized target',
    /\.dpad-btn\{[^}]*width:\s*5\dpx/.test(code)],
];

console.log('');
let failed = 0;
for (const [name, ok] of RULES) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (failed === 0) console.log(`  ${RULES.length}/${RULES.length} passed`);
else console.log(`  ${failed} rule(s) broken — the maze will misbehave on a phone`);

const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) {
  console.error('no inline <script> found in maze.html');
  process.exit(1);
}
const tmp = join(root, 'node_modules', '.maze-check.js');
writeFileSync(tmp, m[1], 'utf8');
try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  console.log('maze script parses OK');
} catch (e) {
  console.error('maze script FAILED to parse:\n' + (e.stderr || e.message));
  process.exit(1);
}

/* leading "/" in a link means "site root", which here is the GitHub profile */
const DEPLOY = ['index.html', 'maze.html', 'sw.js', 'manifest.json', 'config.js'];
const ABSOLUTE = /(?:href|src|start_url|scope)\s*[=:]\s*["'`]?\/(?!\/)/g;
let bad = 0;
for (const f of DEPLOY) {
  let src;
  try {
    src = readFileSync(join(root, f), 'utf8');
  } catch {
    continue;
  }
  src.split('\n').forEach((line, i) => {
    for (const hit of line.matchAll(ABSOLUTE)) {
      // ignore the closing "</script>"-ish or comment markers
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      bad++;
      console.log(`  ${f}:${i + 1}  absolute path  …${hit[0]}…  ${line.trim().slice(0, 90)}`);
    }
  });
}
console.log(bad === 0 ? 'no absolute paths — the site works from its sub-path' : `${bad} absolute path(s)`);
process.exitCode = bad === 0 ? 0 : 1;
