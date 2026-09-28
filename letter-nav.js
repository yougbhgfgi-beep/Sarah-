/**
 * زرارا التمرير للرسالة (فوق وتحت).
 *
 * WHY THIS EXISTS
 * الرسالة بقت طويلة. على موبايل قصير الكارت كان بيقصّ نصّها من غير أي
 * طريقة تقراه، والـ typewriter بيطبع على دفعات — يعني لسه في كلام جاي.
 *
 * WHY IT IS A SEPARATE FILE AND NOT A REACT COMPONENT
 * الرسالة بتترسم جوه الـ bundle (assets/app.js) بـ typewriter. إضافة زرار
 * جواها معناها تعديل الـ bundle، وده شغل هش. الزرار ده بياخد الكارت
 * الموجود في الصفحة وبيعمل له scroll — مفيش أي إضافة للـ DOM جوه React،
 * فمش بيقدر تكسر أي re-render. والـ typewriter بيكمل شغله عادي.
 *
 * السلوك:
 *   - بيظهر بس والرسالة موجودة في الصفحة (MutationObserver على #root)
 *   - بيختفي أي زرار لو خلصت في آخر الرسالة أو في أولها
 *   - بيستخدم scrollBy مش scrollTop عشان الحركة تكون ناعمة
 */
(function () {
  'use strict';

  var STEP = 0.8; // نسبة من ارتفاع الكارت بتتنزل في ضغطة واحدة

  var root = document.getElementById('root');
  if (!root) return;

  /* ---- الزرارين متضافّين على body: بره شجرة React، فمفيش re-render يقدر
         يمسحهم أو يحرّكهم ---- */
  var nav = document.createElement('div');
  nav.id = 'letterNav';
  nav.setAttribute('aria-hidden', 'true');

  function makeButton(cls, glyph, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = glyph;
    b.setAttribute('aria-label', label);
    return b;
  }

  var up = makeButton('up', '▲', 'لأعلى — اقرئي اللي فوق');
  var down = makeButton('down', '▼', 'لتحت — اقرئي اللي تحت');
  nav.appendChild(up);
  nav.appendChild(down);
  document.body.appendChild(nav);

  /* ---- الكارت القابل للتمرير هو الوالد المباشر للرسالة ---- */
  function card() {
    var p = document.querySelector('p.letter-body');
    return p ? p.parentElement : null;
  }

  function sync() {
    var el = card();
    if (!el) {
      nav.classList.remove('on');
      return;
    }
    var max = el.scrollHeight - el.clientHeight;
    if (max <= 4) {
      nav.classList.remove('on');
      return;
    }
    nav.classList.add('on');
    up.hidden = el.scrollTop <= 4;
    down.hidden = el.scrollTop >= max - 4;
  }

  function move(dir) {
    var el = card();
    if (!el) return;
    el.scrollBy({ top: dir * el.clientHeight * STEP, behavior: 'smooth' });
    /* الـ smooth scroll بياخد وقت، فقِس تاني وهو بيحصل وبعد ما يخلص */
    setTimeout(sync, 150);
    setTimeout(sync, 650);
  }

  up.addEventListener('click', function () { move(-1); });
  down.addEventListener('click', function () { move(1); });

  /* الرسالة بتتفتح وتتقفل بتبديل الشاشة كلها جوه #root، فمراقب الـ childList
     هو الإشارة الصح — مفيش polling، ومفيش تعديل على الـ bundle */
  new MutationObserver(sync).observe(root, { childList: true, subtree: true });

  /* الـ typewriter بيكبّر النص حرف حرف، فـ scrollHeight بيتغير من غير ما
     شجرة الـ DOM تتغير. دورة rAF خفيفة تبقي الزرارين على حالهم طول ما هي
     بتقرا. */
  (function tick() {
    if (nav.classList.contains('on')) sync();
    requestAnimationFrame(tick);
  })();

  sync();
  window.addEventListener('resize', sync);
  /* موبايل بيبلّغ بارتفاع قديم لحظة ما شريط العنوان يتحرك */
  window.addEventListener('orientationchange', function () { setTimeout(sync, 300); });
})();
