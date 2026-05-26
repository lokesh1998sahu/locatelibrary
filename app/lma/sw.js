// LMA service worker — scope is restricted to /lma (served from /lma/sw.js).
// It only handles requests under /lma, so other apps on this domain are untouched.
const CACHE = "lma-v1";
const SHELL = ["/lma", "/lma/manifest.webmanifest",
  "/lma/icons/icon-192.png", "/lma/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // ONLY handle same-origin requests under /lma — ignore everything else.
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/lma")) return;
  if (e.request.method !== "GET") return;

  // Network-first for navigations (always fresh app), fall back to cache offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match("/lma")))
    );
    return;
  }

  // Cache-first for static assets under /lma (icons etc.)
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
        return res;
      }).catch(() => cached)
    )
  );
});