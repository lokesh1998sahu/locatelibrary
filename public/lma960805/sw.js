// LMA service worker — scope is restricted to /lma960805 (served from /lma960805/sw.js).
// It only handles requests under /lma960805, so other apps on this domain are untouched.
const CACHE = "lma960805-v1";
const SHELL = ["/lma960805", "/lma960805/manifest.webmanifest",
  "/lma960805/icons/icon-192.png", "/lma960805/icons/icon-512.png"];

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
  // ONLY handle same-origin requests under /lma960805 — ignore everything else.
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/lma960805")) return;
  if (e.request.method !== "GET") return;

  // Network-first for navigations (always fresh app), fall back to cache offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match("/lma960805")))
    );
    return;
  }

  // Cache-first for static assets under /lma960805 (icons etc.)
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