/**
 * static checks for the "connect the stars" game (game-overlay.js + its CSS).
 * run:  npm run check:game
 *
 * WHY THIS EXISTS
 * the game used to be a standalone page (game.html). it is now an overlay that
 * lives inside index.html, and it still has no framework and no test runner, so
 * the only way it gets checked is by reading it. Every rule below is a bug that
 * actually happened in this project, or would happen again on the same class of
 * device.
 *
 * The maze that this replaced was unplayable on a phone and none of it was a
 * JS bug: `body{overflow:hidden}` + a fixed canvas height pushed the d-pad off
 * the bottom of the screen with no way to scroll to it. So the geometry rules
 * are the important ones here — and they now apply to a fixed overlay, which
 * has the same trap in a nastier form.
 *
 * The CSS lives in index.html and the logic in game-overlay.js, so each rule
 * below declares which file it is reading. Comments are stripped from both
 * first, so a rule can never be satisfied — or broken — by a comment that
 * merely talks about the rule.
 */
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const strip = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

const js = strip(readFileSync(join(root, 'game-overlay.js'), 'utf8'));
const html = strip(readFileSync(join(root, 'index.html'), 'utf8'));

let failed = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failed++; };
const pass = (m) => console.log(`  ok    ${m}`);

/* ---------------------------------------------------------------- layout --
   the overlay is `position:fixed`, so a wrong height here is worse than on a
   page: there is nowhere to scroll to if the controls fall off the bottom. */
/* Pull a z-index out of one CSS rule. Returns null when the rule declares none
   — which is itself the answer for this check, since "no z-index" on a
   positioned box is exactly what put the win card behind the stars. */
function zIndexOf(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(esc + '\\s*\\{[^}]*z-index\\s*:\\s*(\\d+)'));
  return m ? Number(m[1]) : null;
}

const zOrder = () => {
  const win = zIndexOf('.gm-win');
  const star = zIndexOf('.gm-star');
  return win !== null && star !== null && win > star;
};

const RULES = [
  ['the overlay is sized against the visible height (dvh / svh, not a fixed px)',
   /#gameOverlay\s*\{[^}]*(dvh|svh)/.test(html)],
  ['the overlay is allowed to scroll (`overflow-y:auto`, not `hidden`)',
   /#gameOverlay\s*\{[^}]*overflow-y\s*:\s*auto/.test(html)],
  /* horizontal overflow is prevented by `width:100%` just as well as by
     `max-width:100%` — either one is correct, so accept both rather than
     failing a board that cannot actually overflow. */
  ['the board cannot overflow sideways (width:100% or max-width:100%)',
   /\.gm-board\s*\{[^}]*(?:width\s*:\s*100%|max-width\s*:\s*100%)/.test(html)],
  ['the board cannot push the controls off a short screen (clamp + dvh)',
   /\.gm-board\s*\{[^}]*height\s*:\s*clamp\([^)]*dvh/.test(html)],
  ['dragging a line does not scroll the page (touch-action:none)',
   /\.gm-board\s*\{[^}]*touch-action\s*:\s*none/.test(html)],
  ['the page behind cannot be rubber-banded while the game is open',
   /html\.gm-open[\s\S]{0,120}overflow\s*:\s*hidden/.test(html)],
  ['the board adapts when the url bar / rotation changes (ResizeObserver)',
   /ResizeObserver/.test(js)],
  ['multi-touch / stray pointer states are cleaned up (pointercancel)',
   /pointercancel/.test(js)],
  ['there is always a way out (a close control and the Escape key)',
   /key === 'Escape'/.test(js) && /gm-close/.test(html)],
  /* It used to open by itself the first time the hero screen appeared, and that
     was too much: uninvited, in the face. The only way in is the play button.
     A polling timer is the shape that did it, so the rule names that shape. */
  ['the game does not open itself (no self-opening timer or observer)',
   !/autoOpened|maybeAutoOpen|setInterval/.test(js)],
  ['the only way in is window.SarahGame.open()',
   /window\.SarahGame\s*=\s*\{\s*open:\s*openOverlay/.test(js)],
  ['the game closes itself when the last star is connected',
   /winTimer\s*=\s*setTimeout/.test(js)],
  /* The stars are z-index 2. A positioned box with no z-index of its own paints
     BELOW them, so the win card ended up behind the constellation and the
     message she had just earned was unreadable. Compared, not just asserted. */
  ['the win card paints ABOVE the stars (z-index compared, not assumed)',
   zOrder()],
  ['the win card has an opaque backdrop, so the text always wins',
   /\.gm-win\s*\{[^}]*background:\s*rgba\([^)]*,\s*(?:0\.9[5-9]|1)\s*\)/.test(html)],
  ['a stray pointer capture cannot throw on an element that rejects it',
   /try\s*\{[^}]*setPointerCapture[^}]*\}\s*catch/.test(js)],
];

for (const [name, ok] of RULES) {
  if (ok) pass(name);
  else fail(name);
}

/* ------------------------------------------------------------ navigation --
   the site is served from a sub-path (/Sarah-/). an absolute '/' link drops
   the visitor on the GitHub profile instead of the site. */
const ABSOLUTE = /(?:location|href|open)\(\s*['"]\/(?!\/)/g;
const abs = [...js.matchAll(ABSOLUTE)].map((m) => m[0]);
if (abs.length === 0) pass('nothing in the game navigates away from the page');
else fail(`absolute navigation would leave the site: ${abs.join(', ')}`);

/* ------------------------------------------------------------ the script --
   a syntax error here is a dead play button on the device the game is played
   on. `node --check` it here instead. */
try {
  execFileSync(process.execPath, ['--check', join(root, 'game-overlay.js')], { stdio: 'pipe' });
  pass('game-overlay.js parses OK');
} catch (e) {
  fail(`game-overlay.js FAILED to parse:\n${e.stderr || e.message}`);
}

/* --------------------------------------------------------------- content --
   the constellation is data: the order in the STARS array IS the order she has
   to connect, so a star can never disagree with its place in the sequence. */
const starsBlock = js.match(/var STARS\s*=\s*\[([\s\S]*?)\];/);
if (!starsBlock) {
  fail('could not find the STARS array in game-overlay.js');
} else {
  const stars = [...starsBlock[1].matchAll(/top\s*:\s*([\d.]+)\s*,\s*left\s*:\s*([\d.]+)/g)];
  if (stars.length >= 2) pass(`${stars.length} stars on the board`);
  else fail(`the board needs at least 2 stars, found ${stars.length}`);

  let off = 0;
  for (const s of stars) {
    const top = Number(s[1]);
    const left = Number(s[2]);
    if (top < 0 || top > 100 || left < 0 || left > 100) {
      fail(`a star sits off the board (top ${top}%, left ${left}%)`);
      off++;
    }
  }
  if (!off && stars.length) pass('every star has a % position inside the board');

  /* two stars in the same place is unplayable — the drag would hit both */
  const seen = new Set();
  let dupe = 0;
  for (const s of stars) {
    const key = `${Math.round(Number(s[1]))},${Math.round(Number(s[2]))}`;
    if (seen.has(key)) dupe++;
    seen.add(key);
  }
  if (!dupe) pass('no two stars sit on top of each other');
  else fail(`${dupe} pair(s) of stars overlap`);
}

/* ------------------------------------------- the contract with the bundle --
   game-overlay.js publishes window.SarahGame and the bundle's play button
   calls it. If either half is renamed the button silently does nothing, and
   the bundle warns about exactly that case. */
if (/window\.SarahGame\s*=\s*\{/.test(js)) pass('game-overlay.js publishes window.SarahGame');
else fail('game-overlay.js does not publish window.SarahGame — the play button will do nothing');

const bundle = readFileSync(join(root, 'assets/app.js'), 'utf8');
if (/window\.SarahGame\?window\.SarahGame\.open\(\)/.test(bundle)) {
  pass('the bundle play button opens the overlay');
} else {
  fail("the bundle still does not call window.SarahGame.open() — run `npm run patch:structure`");
}

if (!/game-overlay\.js\?v=[\d.]+/.test(html)) {
  fail('index.html does not load game-overlay.js — run `npm run version:bump`');
} else {
  pass('index.html loads game-overlay.js, versioned');
}

/* the deleted page must not be referenced anywhere any more */
if (/game\.html/.test(js) || /game\.html/.test(html) || /['"]\.\/game\.html['"]/.test(readFileSync(join(root, 'sw.js'), 'utf8'))) {
  fail('something still points at the removed game.html');
} else {
  pass('the removed game.html is not referenced anywhere');
}

console.log('');
if (failed === 0) {
  console.log('the game overlay: all checks passed');
} else {
  console.log(`  ${failed} check(s) failed — the game will misbehave`);
  process.exit(1);
}
