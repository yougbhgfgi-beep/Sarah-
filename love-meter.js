/**
 * مقياس حبي — الكارت اللي بتضغطي عليه فيطلعلك النسبة.
 *
 * WHY THIS IS A SEPARATE FILE AND NOT A REACT COMPONENT
 * The whole hero screen is a minified React bundle (assets/app.js). Adding a
 * section to it means editing minified code, which is exactly the kind of
 * fragile change this project refuses to make. So this mounts the widget into
 * the page from the outside — the same approach as letter-nav.js.
 *
 * WHY INSERTING INTO REACT'S TREE IS SAFE HERE
 * The hero screen is fully static: React mounts its sections once and then
 * only the counter ticks, which re-renders that component's own subtree and
 * never the section list. This widget is appended as the LAST child of the
 * screen container, which is the one position React cannot insert before —
 * React appends with appendChild, so a trailing foreign node is never
 * displaced. The MutationObserver below is the belt-and-braces guarantee: if a
 * future React version ever did remove it, it comes straight back instead of
 * silently vanishing.
 *
 * ALL COPY COMES FROM config.js (`loveMeter`). Nothing here is a literal, so
 * the wording stays editable without touching this file.
 */
(function () {
  'use strict';

  var cfg = (window.APP_CONFIG && window.APP_CONFIG.loveMeter) || {};
  var root = document.getElementById('root');
  if (!root || !cfg.title) return;

  var el = document.getElementById('loveMeter');
  if (el) return; // already mounted — the observer can call this again

  /* ---------------------------------------------------------- the markup --
     structure follows the design, but the clickable card is a real <button>
     rather than a div with cursor:pointer. that is what makes it reachable by
     keyboard and announced by a screen reader — a div is neither. */
  var NS = 'http://www.w3.org/2000/svg';
  var svg = (name, attrs) => {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    for (var k in attrs) s.setAttribute(k, attrs[k]);
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', attrs.d);
    if (attrs.fill) {
      s.setAttribute('fill', 'currentColor');
      s.removeAttribute('stroke');
    } else {
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '2.5');
      s.setAttribute('stroke-linecap', 'round');
      s.setAttribute('stroke-linejoin', 'round');
    }
    s.appendChild(p);
    return s;
  };

  var section = document.createElement('section');
  section.id = 'loveMeter';
  section.className = 'lm';

  var h2 = document.createElement('h2');
  h2.className = 'lm-title';
  h2.textContent = cfg.title;
  section.appendChild(h2);

  var card = document.createElement('button');
  card.type = 'button';
  card.className = 'lm-card';
  card.setAttribute('aria-expanded', 'false');

  var head = document.createElement('div');
  head.className = 'lm-head';
  var badge = document.createElement('span');
  badge.className = 'lm-badge';
  badge.textContent = cfg.badge;
  var readout = document.createElement('div');
  readout.className = 'lm-readout';
  readout.appendChild(svg('outline-heart', {
    d: 'M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z',
  }));
  var num = document.createElement('span');
  num.className = 'lm-num';
  /* the number is empty until she presses — a "0%" sitting there before the
     press would be a lie, and the empty state is what invites the tap. */
  readout.appendChild(num);
  head.appendChild(badge);
  head.appendChild(readout);
  card.appendChild(head);

  var track = document.createElement('div');
  track.className = 'lm-track';
  var fill = document.createElement('div');
  fill.className = 'lm-fill';
  fill.style.width = '0%';
  track.appendChild(fill);
  card.appendChild(track);

  var heart = document.createElement('div');
  heart.className = 'lm-heart';
  heart.appendChild(svg('filled-heart', {
    d: 'M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z',
    fill: '1',
  }));
  card.appendChild(heart);

  var status = document.createElement('p');
  status.className = 'lm-status';
  status.textContent = cfg.idle || '';
  card.appendChild(status);

  section.appendChild(card);

  /* ------------------------------------------------------------ the number */
  var shown = -1;
  var timer = null;

  function pick() {
    if (!cfg.randomize) return Math.max(0, Math.min(100, Number(cfg.value) || 0));
    var lo = Math.max(0, Number(cfg.min) || 0);
    var hi = Math.min(100, Number(cfg.max) || 100);
    if (hi < lo) hi = lo;
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  /* count up rather than jump — the bar is the whole point, and a number that
     appears instantly reads as a static label instead of a measurement */
  function runTo(target) {
    var from = shown < 0 ? 0 : shown;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      shown = target;
      paint();
      return;
    }
    var steps = 34;
    var i = 0;
    clearInterval(timer);
    timer = setInterval(function () {
      i++;
      /* ease-out: fast at first, settles on the number. linear feels like a
         progress bar for something that has no real progress to report. */
      var t = 1 - Math.pow(1 - i / steps, 3);
      shown = Math.round(from + (target - from) * t);
      paint();
      if (i >= steps) {
        clearInterval(timer);
        timer = null;
        shown = target;
        paint();
      }
    }, 16);
  }

  function paint() {
    fill.style.width = shown + '%';
    num.textContent = (shown > 0 ? shown : '') + (shown > 0 ? '%' : '');
  }

  var revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    card.classList.add('is-open');
    card.setAttribute('aria-expanded', 'true');
    status.textContent = Array.isArray(cfg.reveal) && cfg.reveal.length
      ? cfg.reveal.filter(Boolean).join(' ')
      : cfg.idle || '';
    runTo(pick());
  }

  card.addEventListener('click', reveal);
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      reveal();
    }
  });

  paint();

  /* ------------------------------------------------------------- placement --
     appended after the LAST section of the screen, which is the one spot
     React can never insert in front of. */
  function mount() {
    if (document.getElementById('loveMeter')) return true;
    var sections = root.querySelectorAll('section');
    if (!sections.length) return false;
    var last = sections[sections.length - 1];
    last.parentNode.insertBefore(section, last.nextSibling);
    return true;
  }

  if (!mount()) {
    /* the hero screen has not rendered yet — wait for it rather than guessing
       a delay, and bail out cleanly if it never arrives */
    var tries = 0;
    var poll = setInterval(function () {
      if (mount() || ++tries > 80) clearInterval(poll);
    }, 250);
  }

  /* the screen swaps wholesale (login -> hero -> ending), so re-attach after
     every change: on a real screen change the node is simply absent, and this
     puts it back. */
  new MutationObserver(function () {
    if (!document.getElementById('loveMeter') && root.querySelector('section')) mount();
  }).observe(root, { childList: true, subtree: true });
})();
