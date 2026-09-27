/* =====================================================================
   Service Worker — متغيّرش رقم النسخة بإيدك، شغّل:  npm run version:bump
   ===================================================================== */

const APP_VERSION = 'v8.1.4';
const CACHE_NAME = `love-story-cache-${APP_VERSION}`;

/* مسارات نسبية (مش /images) عشان تشتغل صح على GitHub Pages
   (.../Judy/) وبأي مسار sub-folder تاني. */
const PRECACHE = [
  './',
  './index.html',
  './maze.html',
  './manifest.json',
  './config.js',
  './install.js',
  './assets/app.js',
  './assets/app.css',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/apple-touch-icon.png',
  './images/sara-1.jpg',
  './images/sara-2.jpg',
  './images/sara-3.jpg',
  './images/sara-4.jpg',
];

/* الوسائط الكبيرة (صوت/فيديو) مش بتتح precache عشان متبقاش بطيء أول فتح. */
const RUNTIME_CACHEABLE = /\.(?:mp4|webm|mp3|m4a)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll بيفشل كله لو ملف واحد 404 — بنضيف كل ملف لوحده
      // عشان ملف ناقص ما يبوظش التثبيت كله.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (err) {
            console.warn('[sw] precache skipped:', url, err);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // ملفات خارجية (Google Fonts)

  // التنقل: الشبكة الأول، وأوفلاين بيرجع لـ index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match('./index.html')) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const fromNetwork = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return resp;
        })
        .catch(() => undefined);

      // ملفات الوسائط الكبيرة: الكاش الأول (سرعة) مع تحديث في الخلفية
      if (RUNTIME_CACHEABLE.test(url.pathname) && cached) {
        fromNetwork.catch(() => {});
        return cached;
      }

      // باقي الملفات: الشبكة الأول (عشان تاخد آخر تعديل) ثم الكاش
      return (await fromNetwork) || cached || Response.error();
    })()
  );
});
