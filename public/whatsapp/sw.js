// WhatsApp-Open service worker — scoped to /whatsapp ONLY.
// Served from /whatsapp/sw.js and registered with scope:"/whatsapp".
// It will not touch /lma or any other app on this domain.
const CACHE = 'wa-open-v1';
// '/whatsapp/index.html' was removed — it is a Next route, not a static file,
// so it 404s. The route itself is cached at navigation time by the fetch handler.
const ASSETS = [
  '/whatsapp',
  '/whatsapp/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // Only clean up OLD whatsapp caches (wa-open-*). Never delete other
    // apps' caches (e.g. lma-v1) — that was the bug.
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('wa-open-') && k !== CACHE)
            .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // ONLY handle same-origin requests under /whatsapp. Ignore everything else.
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/whatsapp')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});