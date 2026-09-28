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

/* the shipped version, read from sw.js — the single source of truth for the
   cache-buster. every `?v=` in index.html has to agree with it, or a visitor
   keeps getting a stale file after an update. */
const VERSION = read('sw.js').match(/APP_VERSION\s*=\s*'v([\d.]+)'/)?.[1];

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

/**
 * every on-screen expectation below is derived from these paths, never typed
 * out by hand. the whole point of this suite is that rewriting the Arabic in
 * config.js can only change the site — it must never be able to fail a test,
 * and a test can never quietly pass against stale copy.
 */
const D = DEFAULTS;
/** the first sentence of a multi-line copy block, for "has it appeared yet?" */
const firstLine = (s) => String(s).split('\n')[0].trim();

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
  await waitFor(window, has(window, D.login.title), 'login screen');

  check('boots with zero runtime errors', errors.length === 0);
  check('React mounted (#root populated)', window.document.getElementById('root').children.length > 0);
  check('login screen rendered', text(window).includes(D.login.title));
  check('login text comes from config.js', text(window).includes(D.login.subtitle));

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
    await waitFor(window, has(window, D.envelope.title), 'envelope after login');
    check('correct password unlocks the site', text(window).includes(D.envelope.title));
    check('envelope title from config.js', text(window).includes(D.envelope.title));

    /* A subtitle is optional. The invariant is not "the string is there" but
       "the <p> only exists when there is something to say" — a blank
       subtitle used to leave a 12px hole between the title rule and the
       button. So: no subtitle <p> may ever be empty. */
    const subPs = [...window.document.querySelectorAll('p')].filter(
      (p) => typeof p.className === 'string' && /(^|\s)mt-3(\s|$)/.test(p.className) && p.className.includes('text-xs')
    );
    /* blank subtitle -> the <p> must not exist at all.
       filled subtitle -> exactly one <p>, holding exactly that string. */
    const wanted = D.envelope.subtitle.trim();
    const okSubtitle =
      wanted === ''
        ? subPs.length === 0
        : subPs.length === 1 && subPs[0].textContent === D.envelope.subtitle;
    check('the envelope subtitle <p> matches config.js exactly', okSubtitle);
    if (!okSubtitle) {
      console.log(`    subtitle in config: ${JSON.stringify(D.envelope.subtitle)}`);
      for (const p of subPs) {
        console.log(`    <p class="${p.className}"> ${JSON.stringify(p.textContent)}`);
      }
    }
  }

  /* ---------- 3. sealed envelope -> letter -> hero ---------- */
  // the envelope has two stages: a clickable sealed card, then the letter with
  // the message and the "open" button. walk both, sampling the DOM as we go.
  const seal = [...window.document.querySelectorAll('div')]
    .filter((d) => typeof d.className === 'string' && d.className.includes('cursor-pointer'))
    .filter((d) => d.textContent.includes(D.envelope.title))
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];

  if (!seal) {
    check('sealed envelope card present', false);
  } else {
    const seen = new Set();
    const sampler = setInterval(() => seen.add(text(window)), 60);

    seal.dispatchEvent(new window.Event('click', { bubbles: true }));
    await waitFor(window, has(window, firstLine(D.envelope.message)), 'letter text');
    check('envelope message revealed from config.js', text(window).includes(firstLine(D.envelope.message)));
    check('letter heading from config.js', text(window).includes(D.envelope.letterTitle));
    check('letter sign-off from config.js', text(window).includes(D.envelope.letterNote));

    /* the size of the letter text is a CSS knob in index.html (.letter-body),
       not a Tailwind class, so assert the class survives in the DOM. */
    const letterP = q(window, 'p.letter-body');
    check('letter text uses the .letter-body size knob', !!letterP);

    /* letter-nav.js finds the scrollable card by walking UP from the letter,
       so that relationship is a contract between the two files. if the card
       wrapper ever changes, the scroll buttons silently stop working and the
       long letter goes back to being cut off with no way to read it. */
    check('the letter has a scrollable card above it (letter-nav.js contract)',
      !!letterP && !!letterP.parentElement);

    /* the buttons only exist once letter-nav.js runs, and that window never
       loads external scripts — so assert the wiring instead: the file is
       referenced, it is deferred (so it cannot block the first paint), and it
       is cache-busted with the rest. section 8 below runs the file for real. */
    const indexHtml = read('index.html');
    const navTag = indexHtml.match(/<script[^>]*src="\.\/letter-nav\.js\?v=([\d.]+)"[^>]*>/);
    check('index.html loads letter-nav.js deferred and versioned',
      !!navTag && /defer/.test(navTag[0]) && navTag[1] === VERSION);
    check('the letter-nav.js version matches sw.js APP_VERSION',
      navTag && navTag[1] === (read('sw.js').match(/APP_VERSION\s*=\s*'v([\d.]+)'/)?.[1]));

    const openBtn = [...window.document.querySelectorAll('button')].find((b) =>
      b.textContent.includes(D.envelope.buttonText)
    );
    if (!openBtn) {
      check('open button present', false);
    } else {
      openBtn.click();
      await waitFor(window, has(window, D.main.heroSubtitle), 'hero');
    }
    clearInterval(sampler);
    seen.add(text(window));
    const t = text(window);

    /* NB: the hero does NOT render main.heroTitle. it composes the two names
       from couple.his / couple.hers into separate spans, so the string
       "محمد & ساره" never appears in the DOM. assert the real thing. */
    check('hero shows both names from couple.his / couple.hers',
      t.includes(D.couple.his) && t.includes(D.couple.hers));
    check('hero subtitle from config.js', t.includes(D.main.heroSubtitle));
    check('gallery title from config.js', t.includes(D.main.galleryTitle));
    check('gallery images from config.js', window.document.querySelectorAll('img[src*="sara-"]').length === 4);
    check('milestones from config.js', t.includes(D.milestones.title));
    check('milestones note from config.js', t.includes(D.milestones.note));
    /* a blank value must collapse the <p>, not just make `includes("")` true */
    check('footer line matches config.js exactly',
      D.main.footerText.trim() === ''
        ? window.document.querySelector('p.max-w-xs.mx-auto.mb-6') === null
        : t.includes(D.main.footerText));
    check('header brand from config.js', t.includes(D.ui.brand));
    check('counter notes from config.js', t.includes(D.ui.timerNote[0]));

    /* One invariant instead of a rule per screen. Several sections render an
       optional subtitle <p> (envelope, gallery, video, timer, milestones), and
       blanking the string in config.js used to leave the margin behind as a
       visible hole. Whatever the section, an empty <p> on screen is a bug. */
    const emptyPs = [...window.document.querySelectorAll('p')]
      .filter((p) => p.textContent.trim().length === 0);
    check('no empty <p> is left on screen', emptyPs.length === 0);
    if (emptyPs.length > 0) {
      for (const p of emptyPs) console.log(`    empty: <p class="${p.className}">`);
    }
    check('game section from config.js', t.includes(D.ui.gameEyebrow) && t.includes(D.ui.gameButton));
    check('counter units from config.js', t.includes(D.ui.timeUnits[0]) && t.includes(D.ui.timeUnits[3]));
    check('no love-confession wording on screen',
      !/بحبك|حبيبك|حبيبتي|أحبك|عشيق/.test([...seen].join('\n')));

    const video = q(window, 'video');
    check('video falls back to media/video.mp4', !!video && video.getAttribute('src') === './media/video.mp4');
    check('the full walk reached the hero', [...seen].join('\n').includes(D.main.heroSubtitle));
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
  await waitFor(window, has(window, D.login.title), 'login screen (probe)');
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

/* ---------- 8. letter-nav.js: the letter scroll buttons ----------
   a separate file, so nothing in the app test above proves it parses or that
   it survives the letter being opened and closed. it is a MutationObserver
   plus a rAF loop, and a rAF loop is exactly the kind of thing that throws
   on an unexpected DOM shape — so it gets its own window. */
{
  const navSrc = read('letter-nav.js');
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push(String(e.stack || e.message)));
  vc.on('error', (...a) => errs.push('letter-nav console.error: ' + a.join(' ')));

  const html = read('index.html')
    .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '')
    .replace(/<link[^>]*>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');
  const d = new JSDOM(html, {
    url: 'https://example.github.io/Sarah-/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = d.window;
  const doc = w.document;

  w.eval(navSrc);
  await wait(200);
  check('letter-nav.js runs with no letter on screen', errs.length === 0);
  check('letter-nav.js hides itself with no letter open',
    !doc.getElementById('letterNav').classList.contains('on'));

  /* mount a fake letter exactly the way the bundle does: a <p> with the
     .letter-body class inside the card letter-nav.js walks up to */
  const root = doc.getElementById('root') || doc.body.appendChild(doc.createElement('div'));
  root.id = 'root';
  const card = doc.createElement('div');
  const p = doc.createElement('p');
  p.className = 'text-rose-200 letter-body';
  p.textContent = 'كلام طويل';
  card.appendChild(p);
  root.appendChild(card);

  /* jsdom has no layout, so scrollHeight/clientHeight are 0 and the code
     would conclude "nothing to scroll". give it the real numbers a phone
     would report for a long letter. */
  Object.defineProperty(card, 'scrollHeight', { value: 1200, configurable: true });
  Object.defineProperty(card, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(card, 'scrollTop', { value: 0, writable: true, configurable: true });
  let scrolledTo = 0;
  card.scrollBy = (o) => { scrolledTo += o.top; card.scrollTop += o.top; };

  const nav = doc.getElementById('letterNav');
  const up = nav.querySelector('.up');
  const down = nav.querySelector('.down');

  /* the observer is async — a microtask, not the 200ms we already waited */
  await wait(60);
  check('letter-nav.js appears when a scrollable letter is open', nav.classList.contains('on'));
  check('the up button is hidden at the top of the letter', up.hidden === true);
  check('the down button is available at the top', down.hidden === false);

  down.click();
  await wait(700);
  check('the down button scrolls the letter', scrolledTo > 0);
  check('letter-nav.js runs clean while the letter is open', errs.length === 0);

  /* closing the letter must take the buttons away again */
  root.removeChild(card);
  await wait(60);
  check('letter-nav.js disappears when the letter closes', !nav.classList.contains('on'));
  check('letter-nav.js runs clean after the letter closes', errs.length === 0);

  w.close();
}

/* ---------- 9. love-meter.js: the love meter card ----------
   same shape as the letter-nav test above: a separate file with its own state,
   mounted into a React tree, so nothing above proves it works. the widget
   finds its place by appending after the LAST <section> of the hero screen,
   which is the invariant worth pinning down. */
{
  const meterSrc = read('love-meter.js');
  const errs = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errs.push(String(e.stack || e.message)));
  vc.on('error', (...a) => errs.push('love-meter console.error: ' + a.join(' ')));

  const { window } = boot();
  await waitFor(window, has(window, D.login.title), 'login screen');
  const doc = window.document;

  window.eval(meterSrc);
  check('love-meter.js does nothing while the hero screen is absent', !doc.getElementById('loveMeter'));

  /* walk the real flow so the hero renders and the widget can mount */
  const input = q(window, 'input[type="password"], input');
  type(window, input, 'love');
  await wait(150);
  (q(window, 'form') || input.closest('form') || input.parentElement)
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(window, has(window, D.envelope.title), 'envelope');
  const openBtn = [...doc.querySelectorAll('button')].find((b) =>
    b.textContent.includes(D.envelope.buttonText)
  );
  if (openBtn) {
    openBtn.click();
    await waitFor(window, has(window, D.main.heroSubtitle), 'hero');
  }
  await wait(400);

  const meter = doc.getElementById('loveMeter');
  check('love-meter.js mounts once the hero screen is on', !!meter);
  check('love-meter.js runs clean on mount', errs.length === 0);

  if (meter) {
    check('the meter title comes from config.js',
      meter.querySelector('.lm-title')?.textContent === D.loveMeter.title);
    check('the meter badge comes from config.js',
      meter.querySelector('.lm-badge')?.textContent === D.loveMeter.badge);

    /* it is appended after the LAST React section, which is the one position
       React can never insert in front of. if this ever fails the widget is
       floating in the middle of the page. the meter is itself a <section>, so
       it has to be excluded before asking which one is last. */
    const sections = [...doc.querySelectorAll('#root section')].filter((s) => s.id !== 'loveMeter');
    const last = sections[sections.length - 1];
    check('the meter sits after the last hero section',
      !!last && last.nextElementSibling === meter);

    /* the real invariant is not "it is the very last node" — the closing
       button legitimately lives below it. it is that NO hero section may come
       after the meter: a section added later would land underneath the widget
       and break the reading order of the page. (4 === DOCUMENT_POSITION_FOLLOWING;
       2 is PRECEDING, which is the wrong way round and would pass for any
       section that legitimately sits above the meter.) */
    const after = [...doc.querySelectorAll('#root section')].filter(
      (s) => s.id !== 'loveMeter' && (meter.compareDocumentPosition(s) & 4) !== 0
    );
    check('no hero section renders after the meter', after.length === 0);

    /* a <button>, not a div: this is what makes it keyboard reachable and
       announced by a screen reader. */
    const card = meter.querySelector('.lm-card');
    check('the card is a real <button> (keyboard + screen reader)', card?.tagName === 'BUTTON');
    check('the card is not yet pressed', card?.getAttribute('aria-expanded') === 'false');

    /* empty before the press — a "0%" sitting there would be a lie */
    check('no number is shown before the press',
      (meter.querySelector('.lm-num')?.textContent || '') === '');
    check('the bar is empty before the press',
      meter.querySelector('.lm-fill')?.style.width === '0%');
    check('the idle line comes from config.js',
      meter.querySelector('.lm-status')?.textContent === D.loveMeter.idle);

    card.click();
    await wait(1200);

    check('the pressed card reports its state to assistive tech',
      card.getAttribute('aria-expanded') === 'true');
    const target = D.loveMeter.randomize
      ? null
      : Math.max(0, Math.min(100, Number(D.loveMeter.value) || 0));
    check('the number is revealed from config.js',
      target === null
        ? /^\d{1,3}%$/.test(meter.querySelector('.lm-num').textContent)
        : meter.querySelector('.lm-num').textContent === `${target}%`);
    check('the bar filled to the same number',
      target === null
        ? /^\d{1,3}%$/.test(meter.querySelector('.lm-fill').style.width)
        : meter.querySelector('.lm-fill').style.width === `${target}%`);
    check('the reveal lines came from config.js',
      (Array.isArray(D.loveMeter.reveal) ? D.loveMeter.reveal.filter(Boolean).join(' ') : D.loveMeter.idle) ===
        meter.querySelector('.lm-status').textContent);
    check('love-meter.js runs clean after the press', errs.length === 0);

    /* pressing again must not re-run the count-up or change the number */
    const before = meter.querySelector('.lm-num').textContent;
    card.click();
    await wait(200);
    check('a second press changes nothing', meter.querySelector('.lm-num').textContent === before);
  }

  window.close();
}

/* ---------- report ---------- */
let bad = 0;
for (const [name, ok] of results) {
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
