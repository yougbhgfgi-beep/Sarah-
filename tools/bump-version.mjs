#!/usr/bin/env node
/**
 * bumps the cache version in one shot.
 *
 * the app has FOUR places that must move together or users keep
 * seeing stale content:
 *   1. sw.js            -> APP_VERSION
 *   2. index.html       -> ?v= on config.js / app.js / app.css / every widget
 *   3. package.json     -> version (cosmetic, but it is what `npm` prints,
 *                         and a package.json that lies about its own version
 *                         is worse than no package.json at all)
 *   4. manifest.json    -> (nothing today, kept here for future edits)
 *
 * package.json used to be missed, so it sat at 8.3.0 while the site was on
 * 8.3.1 and nobody noticed for a while. `npm run test:boot` now asserts all
 * of them agree, so the drift cannot come back.
 *
 * run after every deploy:   npm run version:bump
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bump = (process.argv[2] || 'patch').toLowerCase();

const read = (f) => readFileSync(join(root, f), 'utf8');
const write = (f, s) => writeFileSync(join(root, f), s, 'utf8');

const sw = read('sw.js');
const current = sw.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];

if (!current) {
  console.error("couldn't find APP_VERSION in sw.js");
  process.exit(1);
}

const m = current.match(/^v(\d+)\.(\d+)\.(\d+)$/);
if (!m) {
  console.error(`APP_VERSION must look like v1.0.0 (found "${current}")`);
  process.exit(1);
}

const [major, minor, patch] = m.slice(1).map(Number);
const next =
  bump === 'major' ? `v${major + 1}.0.0`
  : bump === 'minor' ? `v${major}.${minor + 1}.0`
  : `v${major}.${minor}.${patch + 1}`;

// 1. sw.js
write('sw.js', sw.replace(/APP_VERSION\s*=\s*'[^']+'/, `APP_VERSION = '${next}'`));

// 2. index.html -> every ?v=... token, whatever it currently is
//    (?v=[^"')]+ not [0-9]+ — a bare \d+ would only eat "8" out of "?v=8.0.0"
//    and leave the old tail glued on: ?v=8.0.1.0.0)
const html = read('index.html');
const refs = html.match(/\?v=[^"')\s]+/g) || [];
const bumpedHtml = html.replace(/\?v=[^"')\s]+/g, `?v=${next.replace(/^v/, '')}`);
write('index.html', bumpedHtml);

// 3. package.json -> "version". replaced once and only if it is the real
//    top-level key, so a dependency that happens to pin a matching string
//    cannot be rewritten by accident.
const pkg = read('package.json');
const bare = next.replace(/^v/, '');
const bumpedPkg = pkg.replace(/("version"\s*:\s*")(\d+\.\d+\.\d+)(")/, `$1${bare}$3`);
if (bumpedPkg === pkg) {
  console.warn('  WARNING: no top-level "version" in package.json — not bumped');
}
write('package.json', bumpedPkg);

console.log(`version ${current} -> ${next}`);
console.log(`  sw.js        APP_VERSION = '${next}'`);
console.log(`  index.html   ?v=${next.replace(/^v/, '')} (${refs.length} refs)`);
if (!refs.length) console.warn('  WARNING: no ?v= tokens found in index.html');
console.log(`  package.json version = '${bare}'`);
console.log('\ndeploy now. users get the update on next page load.');
