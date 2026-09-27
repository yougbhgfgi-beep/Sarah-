/**
 * end-to-end boot test in a real DOM (jsdom).
 * run:  npm run test:boot
 *
 * proves three things:
 *   1. index.html + config.js + assets/app.js render with zero runtime errors
 *   2. config.js is AUTHORITATIVE (an override beats the bundle default)
 *   3. the whole flow works: login -> envelope -> hero -> gallery -> video
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const CFG = read('config.js');
const APP = read('assets/app.js');

/**
 * the app's built-in defaults, straight out of the bundle.
 * tests that check the fallback path read their expectations from here, so
 * they keep working when the wording changes and never go stale.
 */
function bundleDefaults() {
  const decl = APP.indexOf('const Dt={');
  const open = APP.indexOf('{', decl);
  let depth = 0, close = -1;
  for (let i = open; i < APP.length; i++) {
    if (APP[i] === '{') depth++;
    else if (APP[i] === '}' && --depth === 0) { close = i; break; }
  }
  return vm.runInNewContext(`(${APP.slice(open, close + 1)})`);
}
const DEFAULTS = bundleDefaults();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** poll until `fn(window)` is truthy — jsdom timing is not reliable with fixed waits */
async function waitFor(window, fn, label, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (fn(window)) return true;
    await wait(150);
  }
  console.log(`  (timeout waiting for: ${label})`);
  return false;
}

const has = (window, needle) => () => (text(window).includes(needle));

/** boot the page; `configSource` lets a test swap the content file */
function boot(configSource = CFG) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  const dom = new JSDOM(read('index.html'), {
    url: 'http://localhost:8899/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;

  // jsdom has no media stack
  window.HTMLMediaElement.prototype.play = function () {
    this.dispatchEvent(new window.Event('play'));
    return Promise.resolve();
  };
  window.HTMLMediaElement.prototype.pause = function () {
    this.dispatchEvent(new window.Event('pause'));
  };
  window.HTMLMediaElement.prototype.load = function () {};

  // 1. config.js — classic sync script, runs before the module (as in index.html).
  //    jsdom's `outside-only` mode does not run appended <script> nodes, so eval
  //    it directly — same global, same order.
  try {
    window.eval(configSource);
  } catch (e) {
    errors.push('config.js threw: ' + (e.stack || e.message));
  }

  // 2. the bundle, as a module
  try {
    window.eval(APP);
  } catch (e) {
    errors.push('bundle threw: ' + (e.stack || e.message));
  }
  return { window, errors };
}

/** react needs the native value setter to see an input change */
function type(window, el, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  setter.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

const text = (window) => window.document.getElementById('root').textContent || '';
const q = (window, sel) => window.document.querySelector(sel);

const results = [];
const check = (name, ok) => results.push([name, ok]);

/* ---------- 1. clean boot ---------- */
{
  const { window, errors } = boot();
  await waitFor(window, has(window, 'ادخلي'), 'login screen');

  check('boots with zero runtime errors', errors.length === 0);
  check('React mounted (#root populated)', window.document.getElementById('root').children.length > 0);
  check('login screen rendered', text(window).includes('ادخلي'));
  check('login text comes from config.js', text(window).includes('الموقع ده خاص'));

  const audio = q(window, 'audio');
  check('audio wired to the mp3', !!audio && audio.getAttribute('src') === './media/audio/khalini.mp3');

  /* ---------- 2. full flow: login -> envelope ---------- */
  const input = q(window, 'input[type="password"], input');
  if (!input) {
    check('password input present', false);
  } else {
    type(window, input, 'love');
    await wait(150);
    const form = q(window, 'form') || input.closest('form') || input.parentElement;
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(window, has(window, 'كلام محفوظ من زمان'), 'envelope after login');
    check('correct password unlocks the site', text(window).includes('كلام محفوظ من زمان'));
    check('envelope title from config.js', text(window).includes('مش عارف أبدأ منين'));
  }

  /* ---------- 3. sealed envelope -> letter -> hero ---------- */
  // the envelope has two stages: a clickable sealed card, then the letter with
  // the message and the "open" button. walk both, sampling the DOM as we go.
  const seal = [...window.document.querySelectorAll('div')]
    .filter((d) => typeof d.className === 'string' && d.className.includes('cursor-pointer'))
    .filter((d) => d.textContent.includes('كلام محفوظ من زمان'))
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];

  if (!seal) {
    check('sealed envelope card present', false);
  } else {
    const seen = new Set();
    const sampler = setInterval(() => seen.add(text(window)), 60);

    seal.dispatchEvent(new window.Event('click', { bubbles: true }));
    await waitFor(window, has(window, 'قعدت ساعات بحاول'), 'letter text');
    check('envelope message revealed from config.js', text(window).includes('قعدت ساعات بحاول'));
    check('letter heading from config.js', text(window).includes('الكلام ده ليكي'));
    check('letter sign-off from config.js', text(window).includes('مش طالب حاجة'));

    const openBtn = [...window.document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('افتحي الكلام ده')
    );
    if (!openBtn) {
      check('open button present', false);
    } else {
      openBtn.click();
      await waitFor(window, has(window, 'ده مش عن الحب'), 'hero');
    }
    clearInterval(sampler);
    seen.add(text(window));
    const t = text(window);

    check('hero shows the couple names', t.includes('محمد') && t.includes('ساره'));
    check('hero subtitle from config.js', t.includes('ده مش عن الحب'));
    check('gallery title from config.js', t.includes('من راحتك'));
    check('gallery images from config.js', window.document.querySelectorAll('img[src*="sara-"]').length === 4);
    check('milestones from config.js', t.includes('حاجات اتغيّرت فيا'));
    check('milestones note from config.js', t.includes('وتفضل الحكاية بتزيد'));
    check('footer text from config.js', t.includes('كان يستاهل يتكتب'));
    check('header brand from config.js', t.includes('من محمد'));
    check('counter notes from config.js', t.includes('من يوم ماعرفتها'));
    check('maze section from config.js', t.includes('حاجة اتعلّمتها منها') && t.includes('العب المتاهة'));
    check('counter units from config.js', t.includes('سنوات') && t.includes('دقائق'));
    check('no love-confession wording on screen',
      !/بحبك|حبيبك|حبيبتي|أحبك|عشيق/.test([...seen].join('\n')));

    const video = q(window, 'video');
    check('video falls back to media/video.mp4', !!video && video.getAttribute('src') === './media/video.mp4');
    check('the full walk reached the hero', [...seen].join('\n').includes('ده مش عن الحب'));
  }

  if (errors.length) console.log('errors:\n' + errors.join('\n---\n'));
}

/* ---------- 4. config.js is authoritative ---------- */
{
  // replace the real login subtitle with a marker. the bundle defaults are
  // generated from config.js (npm run sync:bundle, enforced by npm run audit),
  // so DEFAULTS.login.subtitle is the exact string to look for here.
  const probe = CFG.replace(DEFAULTS.login.subtitle, 'PROBE-OVERRIDE-123');
  const { window, errors } = boot(probe);
  await waitFor(window, has(window, 'ادخلي'), 'login screen (probe)');
  check('config.js actually executed', typeof window.APP_CONFIG === 'object');
  check('the probe really changed config.js', probe !== CFG);
  check(
    'config.js override beats the bundle default',
    text(window).includes('PROBE-OVERRIDE-123') && !text(window).includes(DEFAULTS.login.subtitle)
  );
  check('no errors with an overridden config', errors.length === 0);
}

/* ---------- 5. a partial config.js must not wipe untouched sections ---------- */
{
  // no login section here — so the BUNDLE default must survive.
  // expected text is read from the bundle itself, so it never goes stale.
  const { window, errors } = boot('window.APP_CONFIG = { main: { heroTitle: "STILL-HERE" } };');
  await waitFor(window, has(window, DEFAULTS.login.title), 'login screen (partial config)');
  check(
    'a partial config keeps untouched bundle defaults',
    text(window).includes(DEFAULTS.login.subtitle)
  );
  check('a partial config still applies its own key', window.APP_CONFIG.main.heroTitle === 'STILL-HERE');
  check('a partial config causes no errors', errors.length === 0);
}

/* ---------- 6. a config.js with a syntax error must not kill the site ---------- */
{
  const { window, errors } = boot('window.APP_CONFIG = { broken: ');
  await waitFor(window, has(window, DEFAULTS.login.title), 'login screen (broken config)');
  check(
    'a broken config.js falls back to the bundle defaults',
    text(window).includes(DEFAULTS.login.subtitle)
  );
  check('a broken config.js is reported, not silent', errors.some((e) => e.includes('config.js threw')));
}

/* ---------- 7. install.js: the app-install button ---------- */
{
  const installSrc = read('install.js');
  const makeWindow = (ua) => {
    const errs = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errs.push('install.js: ' + (e.stack || e.message)));
    vc.on('error', (...a) => errs.push('install.js console.error: ' + a.join(' ')));
    const d = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://example.github.io/Judy/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: vc,
    });
    if (ua) Object.defineProperty(d.window.navigator, 'userAgent', { value: ua });
    return { w: d.window, errs };
  };
  const IOS_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const shown = (w) => {
    const el = w.document.getElementById('installPrompt');
    return !!el && el.classList.contains('ip-in');
  };

  // desktop: nothing to offer (no beforeinstallprompt) -> must inject nothing
  {
    const { w, errs } = makeWindow();
    w.eval(installSrc);
    await wait(5200);
    check('install.js leaves the DOM alone when it cannot install', !shown(w) && errs.length === 0);
  }

  // android: real beforeinstallprompt -> button + native dialog
  {
    const { w, errs } = makeWindow();
    w.eval(installSrc);
    await wait(200);
    let nativeDialogShown = false;
    const ev = new w.Event('beforeinstallprompt');
    ev.prompt = () => { nativeDialogShown = true; };
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    w.dispatchEvent(ev);
    await wait(400);
    check('install button appears on android', shown(w));
    w.document.querySelector('.ip-go').click();
    await wait(400);
    check('the native install dialog is opened', nativeDialogShown);
    check('install.js runs clean on android', errs.length === 0);
  }

  // ios: no install API -> manual steps, and a dismissed visitor is left alone
  {
    const { w, errs } = makeWindow(IOS_UA);
    w.eval(installSrc);
    await wait(3200);
    check('ios gets manual instructions', shown(w));
    w.document.querySelector('.ip-dismiss').click();
    await wait(600);
    w.eval(installSrc);
    await wait(3200);
    check('a dismissed visitor is not asked again', !shown(w));
    check('install.js runs clean on ios', errs.length === 0);
  }
}

/* ---------- report ---------- */
let bad = 0;
for (const [name, ok] of results) {
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
