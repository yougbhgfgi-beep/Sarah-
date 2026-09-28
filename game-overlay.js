/**
 * لعبة "وصل النجوم" — نافذة بتظهر فوق الصفحة نفسها.
 *
 * WHY THIS IS A SEPARATE FILE AND NOT A REACT COMPONENT
 * Same reason as letter-nav.js and love-meter.js: the hero screen is a
 * minified React bundle, so a new section inside it means editing build
 * output. This file builds the whole overlay from outside and hangs it off
 * <body>, which React never touches.
 *
 * The bundle's play button calls window.SarahGame.open() — see the last entry
 * in tools/patch-structure.mjs.
 *
 * WHY THERE ARE NO NUMBERS ON THE STARS
 * A number on every star turns the constellation into a worksheet. Exactly one
 * star glows at a time (`.next`) and that is the only instruction she needs, so
 * the numbers would only be noise on top of it.
 *
 * ALL COPY COMES FROM config.js (`game`). Nothing here is a literal.
 */
(function () {
  'use strict';

  var CFG = (window.APP_CONFIG && window.APP_CONFIG.game) || {};
  var root = document.getElementById('root');
  if (!root || !CFG.winTitle) return;

  /* `{0}` / `{1}` substitution — config.js may not hold functions, so the
     templates are resolved here. */
  function fill(tpl) {
    var args = Array.prototype.slice.call(arguments, 1);
    return String(tpl).replace(/\{(\d+)\}/g, function (m, i) {
      var v = args[Number(i)];
      return v === undefined ? m : v;
    });
  }

  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function toArabic(n) {
    return String(n).split('').map(function (d) { return AR_DIGITS[+d]; }).join('');
  }

  /* ------------------------------------------------------------- the stars --
     Order in this array IS the order she has to connect, so a star can never
     disagree with its position in the sequence. Positions are % of the board,
     which keeps the constellation's shape on any screen. */
  var STARS = [
    { top: 27.4, left: 76.8 },
    { top: 44.1, left: 45.3 },
    { top: 73.6, left: 24.2 },
    { top: 64.9, left: 63.7 },
    { top: 31.2, left: 13.5 },
  ];

  var WIN_STAY_MS = 4500;   /* how long the win card sits there before it closes */

  /* ================================================================ markup == */
  var overlay = document.createElement('div');
  overlay.id = 'gameOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', CFG.winTitle);
  overlay.hidden = true;

  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'gm-close';
  close.setAttribute('aria-label', CFG.closeLabel);
  close.appendChild(glyph('M6 6l12 12M18 6L6 18', false));
  overlay.appendChild(close);

  var h1 = document.createElement('h2');
  h1.className = 'gm-title';
  h1.textContent = (window.APP_CONFIG.ui && window.APP_CONFIG.ui.gameTitle) || '';
  overlay.appendChild(h1);

  var sub = document.createElement('p');
  sub.className = 'gm-sub';
  sub.textContent = CFG.subtitle || '';
  overlay.appendChild(sub);

  var board = document.createElement('div');
  board.id = 'gmBoard';
  board.className = 'gm-board';

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'gm-lines');
  svg.setAttribute('aria-hidden', 'true');
  var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML =
    '<linearGradient id="gmGold" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="#D4AF37"></stop>' +
    '<stop offset="100%" stop-color="rgb(196,13,116)"></stop>' +
    '</linearGradient>';
  svg.appendChild(defs);
  board.appendChild(svg);

  /* one SVG star per node — not a text glyph and not an emoji, so it inherits
     colour from CSS and stays crisp at any size */
  var STAR_PATH =
    'M12 2.6l2.63 5.9 6.37.72-4.72 4.3 1.28 6.28L12 16.79l-5.56 3.01 1.28-6.28L3 9.22l6.37-.72z';
  var nodes = STARS.map(function (pos) {
    var n = document.createElement('div');
    n.className = 'gm-star';
    n.style.top = pos.top + '%';
    n.style.left = pos.left + '%';
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', STAR_PATH);
    s.appendChild(p);
    n.appendChild(s);
    board.appendChild(n);
    return n;
  });

  var caption = document.createElement('p');
  caption.className = 'gm-caption';
  caption.textContent = CFG.caption || '';
  board.appendChild(caption);

  overlay.appendChild(board);

  var counter = document.createElement('p');
  counter.className = 'gm-progress';
  overlay.appendChild(counter);

  var replay = document.createElement('button');
  replay.type = 'button';
  replay.className = 'gm-replay';
  replay.textContent = CFG.replay || '';
  replay.hidden = true;
  overlay.appendChild(replay);

  var win = document.createElement('div');
  win.className = 'gm-win';
  /* `hidden` is a reflected boolean, so an element that never had it set
     reports `false` — an unset win card would be VISIBLE from the first frame.
     The `[hidden]` CSS guard below only matches the attribute, so this line is
     what actually keeps the card off the board. */
  win.hidden = true;
  var hearts = document.createElement('div');
  hearts.className = 'gm-hearts';
  hearts.textContent = '🤍';
  var winTitle = document.createElement('h3');
  winTitle.textContent = CFG.winTitle;
  var winMsg = document.createElement('p');
  winMsg.textContent = (CFG.winMessage || '').replace(/\n/g, ' ');
  win.appendChild(hearts);
  win.appendChild(winTitle);
  win.appendChild(winMsg);
  overlay.appendChild(win);

  document.body.appendChild(overlay);

  function glyph(d, fill) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    if (fill) {
      s.setAttribute('fill', 'currentColor');
    } else {
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '2');
      s.setAttribute('stroke-linecap', 'round');
    }
    s.appendChild(p);
    return s;
  }

  /* ================================================================= state == */
  var step = 0;               /* stars already connected                          */
  var drawing = null;         /* the <path> she is dragging right now             */
  var from = null;            /* the star that drag started on                    */
  var size = { w: 0, h: 0 };  /* the board's real pixel size                      */
  var won = false;
  var winTimer = null;
  var opener = null;

  /* the % positions mean nothing until we know how big the board is, and the
     board changes with the window, the url bar, and orientation */
  function measure() {
    var r = board.getBoundingClientRect();
    size.w = r.width;
    size.h = r.height;
    svg.setAttribute('viewBox', '0 0 ' + Math.round(size.w) + ' ' + Math.round(size.h));
    redraw();
  }

  function center(el) {
    return {
      x: (parseFloat(el.style.left) / 100) * size.w,
      y: (parseFloat(el.style.top) / 100) * size.h,
    };
  }

  function line(a, b) {
    var p1 = center(a), p2 = center(b);
    var d = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    d.setAttribute('d', 'M' + p1.x + ' ' + p1.y + ' L' + p2.x + ' ' + p2.y);
    svg.appendChild(d);
    return d;
  }

  /* redraw every finished line, so the constellation keeps its shape on resize
     instead of drifting away from the stars */
  function redraw() {
    var done = svg.querySelectorAll('path:not(.pending)');
    for (var i = 0; i < done.length; i++) done[i].remove();
    for (var s = 0; s < step; s++) line(nodes[s], nodes[s + 1]);
  }

  /* Exactly one star is "next" at a time — the board always shows her where to
     start, so she can never get stuck and never has to guess.

     `step` is the index of the star she connects FROM next, so it runs 0..N-2:
     with N stars there are N-1 connections, never N. The readout counts the
     star she is standing on (1-based), not the lines she has drawn, because
     "٣ من ٥ نجوم" is a thing she can picture and "٢ من ٤ وصلات" is not. */
  function paint() {
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('is-done', won || i < step);
      nodes[i].classList.toggle('is-next', !won && i === step);
    }
    counter.textContent = fill(
      CFG.progress,
      toArabic(won ? nodes.length : step + 1),
      toArabic(nodes.length)
    );
  }

  function winNow() {
    won = true;
    win.hidden = false;
    replay.hidden = false;
    paint();
    /* the game is over the moment the last star is in — the card gets a moment
       to be read, then it puts her straight back on the page she was on */
    winTimer = setTimeout(function () { closeOverlay(); }, WIN_STAY_MS);
  }

  function connect(i) {
    /* N stars means N-1 connections. Without this bound the last attempt reads
       nodes[N], which is undefined, and center() throws on it. */
    if (won || i < 0 || i >= nodes.length - 1) return;
    line(nodes[i], nodes[i + 1]);
    step = i + 1;
    if (step === nodes.length - 1) {
      caption.textContent = CFG.done || '';
      winNow();
      return;
    }
    paint();
  }

  /* ============================================================== gestures ==
     Pointer events cover mouse, touch and stylus with one code path. */
  function starAt(x, y) {
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      var pad = 10;   /* a finger is much wider than a star */
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return i;
    }
    return -1;
  }

  function cancelDrag() {
    if (drawing) drawing.remove();
    drawing = null;
    from = null;
  }

  board.addEventListener('pointerdown', function (e) {
    if (won) return;
    var i = starAt(e.clientX, e.clientY);
    if (i !== step) {
      /* a wrong star gets a nudge, never a penalty */
      if (i > -1) {
        nodes[i].classList.remove('is-wrong');
        void nodes[i].offsetWidth;   /* restart the animation */
        nodes[i].classList.add('is-wrong');
      }
      return;
    }
    from = i;
    if (board.setPointerCapture) {
      try { board.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    }
    drawing = line(nodes[i], nodes[i + 1]);
    drawing.classList.add('is-pending');
    e.preventDefault();
  });

  board.addEventListener('pointermove', function (e) {
    if (!drawing || from === null) return;
    var a = center(nodes[from]);
    var r = board.getBoundingClientRect();
    drawing.setAttribute(
      'd',
      'M' + a.x + ' ' + a.y + ' L' + (e.clientX - r.left) + ' ' + (e.clientY - r.top)
    );
    e.preventDefault();
  });

  function release(e) {
    if (!drawing || from === null) return;
    if (starAt(e.clientX, e.clientY) === step + 1) {
      drawing.remove();
      drawing = null;
      connect(from);
    } else {
      cancelDrag();   /* released on empty space or the wrong star */
    }
    from = null;
  }
  board.addEventListener('pointerup', release);
  board.addEventListener('pointercancel', cancelDrag);

  /* Tapping the glowing star without dragging anywhere connects it for her, so
     the game is always completable no matter how fussy the touchscreen is. */
  nodes.forEach(function (el, i) {
    el.addEventListener('click', function () {
      if (!won && i === step) connect(i);
    });
  });

  /* ================================================================ opening == */
  function openOverlay() {
    if (!overlay.hidden) return;
    opener = document.activeElement;
    overlay.hidden = false;
    /* the page behind must not scroll while the dialog is up — on a phone the
       rubber-band scroll would otherwise drag the whole site under it */
    document.documentElement.classList.add('gm-open');
    measure();
    close.focus();
  }

  function closeOverlay() {
    if (overlay.hidden) return;
    clearTimeout(winTimer);
    winTimer = null;
    overlay.hidden = true;
    document.documentElement.classList.remove('gm-open');
    if (opener && opener.focus) opener.focus();
    opener = null;
  }

  close.addEventListener('click', closeOverlay);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeOverlay();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) closeOverlay();
  });

  replay.addEventListener('click', function () {
    step = 0;
    won = false;
    clearTimeout(winTimer);
    winTimer = null;
    win.hidden = true;
    replay.hidden = true;
    cancelDrag();
    redraw();
    paint();
    caption.textContent = CFG.caption || '';
  });

  /* keep measuring — the board is inside a flex column whose height depends on
     the text above it, so a font or orientation change moves it */
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(board);
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', function () { setTimeout(measure, 250); });
  if (typeof visualViewport !== 'undefined' && visualViewport) {
    visualViewport.addEventListener('resize', measure);
  }

  /* Paint before the first frame, so the board is never caught with an empty
     counter and no glowing star — that reads as a dead board and leaves her no
     idea which star to start from. */
  paint();

  /* NO auto-open. The game used to open by itself the first time the hero
     screen appeared; it was too much, uninvited, in the face. She opens it on
     purpose now — via the play button, which is the only caller of open().
     Do not add a timer back here. */

  /* the contract the bundle's play button calls */
  window.SarahGame = { open: openOverlay, close: closeOverlay };
})();
