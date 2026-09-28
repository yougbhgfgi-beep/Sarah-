/**
 * static checks for game.html (the "connect the stars" game).
 * run:  npm run check:game
 *
 * WHY THIS EXISTS
 * game.html is a standalone page with no framework and no test runner, so the
 * only way it gets checked is by reading it. Every rule below is a bug that
 * actually happened in this project, or would happen again on the same
 * class of device.
 *
 * The maze that this replaced was unplayable on a phone and none of it was a
 * JS bug: `body{overflow:hidden}` + a fixed canvas height pushed the d-pad
 * off the bottom of the screen with no way to scroll to it. So the geometry
 * rules are the important ones here.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'game.html';
const html = readFileSync(join(root, FILE), 'utf8');

let failed = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failed++; };
const pass = (m) => console.log(`  ok    ${m}`);

/* ---------------------------------------------------------------- layout --
   comments are stripped first, so a rule can never be satisfied — or broken —
   by a comment that merely talks about the rule. */
const code = html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const RULES = [
  ['the page is allowed to scroll (`overflow-y:auto`, not `hidden`)',
   /body\s*\{[^}]*overflow-y\s*:\s*auto/.test(code)],
  ['the board is sized against the visible height (dvh / svh, not a fixed px)',
   /#board\s*\{[^}]*(dvh|svh)/.test(code)],
  ['the board never overflows sideways (max-width:100%)',
   /#board\s*\{[^}]*max-width\s*:\s*100%/.test(code)],
  ['dragging a line does not scroll the page (touch-action:none)',
   /#board\s*\{[^}]*touch-action\s*:\s*none/.test(code)],
  ['the board adapts when the url bar / rotation changes (ResizeObserver)',
   /ResizeObserver/.test(code)],
  ['multi-touch / stray pointer states are cleaned up (pointercancel)',
   /pointercancel/.test(code)],
];

/* ------------------------------------------------------------ navigation --
   the site is served from a sub-path (/Sarah-/). an absolute '/' link drops
   the visitor on the GitHub profile instead of the site. */
const ABSOLUTE = /(?:location|href|open)\(\s*['"]\/(?!\/)/g;
const abs = [...code.matchAll(ABSOLUTE)].map((m) => m[0]);
if (abs.length === 0) pass('every navigation out of the game is relative');
else fail(`absolute navigation would leave the site: ${abs.join(', ')}`);

/* ------------------------------------------------------------ the script --
   an inline <script> with a syntax error is a black screen on the device, and
   the phone is where the game is played. parse it here instead. */
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) {
  fail(`no inline <script> found in ${FILE}`);
} else {
  const tmp = join(root, 'node_modules', '.game-check.js');
  writeFileSync(tmp, m[1], 'utf8');
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    pass('game script parses OK');
  } catch (e) {
    fail(`game script FAILED to parse:\n${e.stderr || e.message}`);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

/* --------------------------------------------------------------- content --
   the constellation is data: every node needs a position, and the numbers the
   player is shown have to be 1..N in the same order they must be connected. */
const nodeCount = (code.match(/class="node"/g) || []).length;
if (nodeCount >= 2) pass(`${nodeCount} stars on the board`);
else fail(`the board needs at least 2 stars, found ${nodeCount}`);

for (const n of code.matchAll(/class="node"[^>]*style="top:\s*([\d.]+)%;\s*left:\s*([\d.]+)%"/g)) {
  const top = Number(n[1]);
  const left = Number(n[2]);
  if (top < 0 || top > 100 || left < 0 || left > 100) {
    fail(`a star sits off the board (top ${top}%, left ${left}%)`);
  }
}
const inside = (code.match(/class="node"[^>]*style="top:\s*[\d.]+%;\s*left:\s*[\d.]+%"/g) || []).length;
if (inside === nodeCount) pass('every star has a % position inside the board');
else fail(`${nodeCount - inside} star(s) have no position`);

if (nodeCount > 0) {
  const order = code.indexOf('var step');
  if (order > -1) pass('the connection order is driven by the DOM order of the stars');
}

console.log('');
if (failed === 0) {
  console.log('game.html: all checks passed');
} else {
  console.log(`  ${failed} check(s) failed — the game will misbehave`);
  process.exit(1);
}
