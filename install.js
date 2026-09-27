/* =====================================================================
   Install as an app — زر التثبيت
   ---------------------------------------------------------------------
   • Android / Chrome / Edge : بيستخدم beforeinstallprompt (نفس dialog الأصلي)
   • iOS / Safari            : مفيش API للتثبيت، فبنعرض خطوات Add to Home Screen
   • Already installed        : الزر مش بيظهر خالص
   • بيتسجل مرة كل أسبوع     : عشان مايقولش "ثبّت" كل مرة
   ===================================================================== */

(function () {
  'use strict';

  var DISMISS_KEY = 'sara.install.dismissedAt';
  var DISMISS_DAYS = 7;
  var DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

  /* matchMedia is universal in real browsers, but never let a missing
     implementation take the whole script down with it */
  var mq = function (query) {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia(query)
      : { matches: false, addListener: function () {}, addEventListener: function () {} };
  };

  /* don't bother people who already have it on their home screen */
  var standalone =
    mq('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (standalone) return;

  try {
    var dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;
  } catch (e) {
    /* private mode — just show it */
  }

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

  /* iOS has no install prompt API at all, so the button is the only way in */
  var needsIOSGuide = isIOS && isSafari;
  var deferredPrompt = null;

  if (!needsIOSGuide) {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      show();
    });
    window.addEventListener('appinstalled', function () {
      hide();
    });
  }

  /* ---------- markup ---------- */

  var ICON_DOWNLOAD =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>';

  var ICON_SHARE =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 15V3"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>';

  /* ---------- refs, populated on first mount ---------- */
  var root = null;
  var $icon, $title, $body, $go, $later, $dismiss;

  /* Nothing touches the DOM until we actually have something to offer —
     no empty div sitting in the page for every visitor who can just install. */
  function mount() {
    if (root) return;

    root = document.createElement('div');
    root.id = 'installPrompt';
    root.setAttribute('aria-live', 'polite');
    root.innerHTML =
      '<div class="ip-card" role="dialog" aria-label="تثبيت التطبيق">' +
      '  <div class="ip-row">' +
      '    <span class="ip-icon" aria-hidden="true"></span>' +
      '    <div class="ip-text">' +
      '      <p class="ip-title"></p>' +
      '      <p class="ip-body"></p>' +
      '    </div>' +
      '  </div>' +
      '  <div class="ip-actions">' +
      '    <button type="button" class="ip-dismiss" aria-label="إخفاء">×</button>' +
      '    <button type="button" class="ip-later">لاحقًا</button>' +
      '    <button type="button" class="ip-go"></button>' +
      '  </div>' +
      '</div>';

    $icon = root.querySelector('.ip-icon');
    $title = root.querySelector('.ip-title');
    $body = root.querySelector('.ip-body');
    $go = root.querySelector('.ip-go');
    $later = root.querySelector('.ip-later');
    $dismiss = root.querySelector('.ip-dismiss');

    document.head.appendChild(buildStyle());
    document.body.appendChild(root);

    $dismiss.addEventListener('click', dismiss);
    $later.addEventListener('click', dismiss);
    $go.addEventListener('click', onInstall);
  }

  function buildStyle() {
    var style = document.createElement('style');
    style.textContent = [
    '#installPrompt{position:fixed;inset:auto 0 0 0;z-index:9999;pointer-events:none;',
    'padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom));',
    'font-family:inherit;opacity:0;transform:translateY(14px);transition:opacity .35s ease,transform .35s ease}',
    '#installPrompt.ip-in{opacity:1;transform:none;pointer-events:auto}',
    '#installPrompt .ip-card{max-width:26rem;margin-inline-start:auto;margin-inline-end:0;',
    'background:rgba(22,7,12,.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
    'border:1px solid rgba(244,63,94,.28);border-radius:18px;padding:14px 16px;',
    'box-shadow:0 18px 50px rgba(0,0,0,.55)}',
    '#installPrompt .ip-row{display:flex;gap:12px;align-items:flex-start}',
    '#installPrompt .ip-icon{flex:0 0 auto;display:grid;place-items:center;width:34px;height:34px;',
    'border-radius:11px;background:rgba(244,63,94,.14);color:#fda4af}',
    '#installPrompt .ip-text{margin:0;min-width:0}',
    '#installPrompt .ip-title{margin:0 0 2px;font-size:15px;font-weight:600;color:#ffe4e6;line-height:1.5}',
    '#installPrompt .ip-body{margin:0;font-size:13px;line-height:1.7;color:#fecdd3;opacity:.85}',
    '#installPrompt .ip-body b{color:#fda4af;font-weight:600}',
    '#installPrompt .ip-actions{display:flex;gap:8px;align-items:center;margin-top:12px}',
    '#installPrompt .ip-dismiss{margin-inline-end:auto;order:-1;width:30px;height:30px;border:0;',
    'border-radius:9px;background:transparent;color:#f9a8b4;font-size:19px;line-height:1;cursor:pointer}',
    '#installPrompt .ip-dismiss:hover{background:rgba(244,63,94,.12)}',
    '#installPrompt .ip-later,#installPrompt .ip-go{border-radius:11px;padding:9px 16px;',
    'font-size:13px;font-family:inherit;cursor:pointer;transition:background .2s ease,border-color .2s ease}',
    '#installPrompt .ip-later{background:transparent;border:1px solid rgba(251,113,133,.22);color:#fecdd3}',
    '#installPrompt .ip-later:hover{border-color:rgba(251,113,133,.45)}',
    '#installPrompt .ip-go{display:inline-flex;align-items:center;gap:7px;font-weight:600;',
    'color:#fff;border:1px solid rgba(244,63,94,.5);background:linear-gradient(180deg,#e11d48,#9f1239)}',
    '#installPrompt .ip-go:hover{background:linear-gradient(180deg,#f43f5e,#be123c);border-color:#fb7185}',
    '#installPrompt .ip-go:disabled{opacity:.55;cursor:default}',
    '@media (max-width:420px){#installPrompt .ip-body{font-size:12.5px}}',
    '@media (prefers-reduced-motion:reduce){#installPrompt{transition:none}}',
    ].join('');
    return style;
  }

  function show() {
    mount();

    if (needsIOSGuide) {
      $icon.innerHTML = ICON_SHARE;
      $title.textContent = 'ثبّتي الموقع على التليفون';
      $body.innerHTML =
        'دوسي على <b>المشاركة</b> (السهم الصاعد) في سفاري، وبعدين اختاري ' +
        '<b>Add to Home Screen</b> — هيبقى على طول في تليفونك.';
      $go.textContent = 'فهمت';
    } else {
      $icon.innerHTML = ICON_DOWNLOAD;
      $title.textContent = 'ثبّتي الموقع كتطبيق';
      $body.textContent = 'هيفتح لوحده، ويشتغل من غير نت.';
      $go.textContent = 'ثبّتي';
    }
    requestAnimationFrame(function () {
      root.classList.add('ip-in');
    });
  }

  function hide() {
    if (!root) return;
    root.classList.remove('ip-in');
    window.setTimeout(function () {
      root.remove();
      root = null;
    }, 350);
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (e) {
      /* nothing we can do */
    }
    hide();
  }

  function onInstall() {
    if (needsIOSGuide || !deferredPrompt) {
      dismiss();
      return;
    }
    $go.disabled = true;
    deferredPrompt.prompt();
    deferredPrompt.userChoice
      .catch(function () {
        /* user closed the sheet */
      })
      .then(function () {
        deferredPrompt = null;
        hide();
      });
  }

  /* desktop chrome fires this only when the app really is installable;
     iOS has no such event, so we just offer the manual steps after a beat */
  function afterLoad() {
    window.setTimeout(function () {
      if (needsIOSGuide) show();
      else if (deferredPrompt) show();
    }, needsIOSGuide ? 2500 : 4000);
  }

  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
})();
