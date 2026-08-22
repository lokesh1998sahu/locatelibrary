// MF 2.0 service worker — scope is restricted to /mf17052606 (served from
// /mf17052606/sw.js). It only handles requests under /mf17052606, so LMA and
// anything else on this domain are untouched.
const CACHE = "mf17052606-v1";
const SHELL = ["/mf17052606", "/mf17052606/manifest.webmanifest",
  "/mf17052606/icons/icon-192.png", "/mf17052606/icons/icon-512.png"];

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
  // ONLY handle same-origin requests under /mf17052606 — ignore everything else.
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/mf17052606")) return;
  if (e.request.method !== "GET") return;

  // Never cache the API: money must always come from the server.
  if (url.pathname.startsWith("/api/")) return;

  // Network-first for navigations (always fresh app), fall back to cache offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match("/mf17052606")))
    );
    return;
  }

  // Cache-first for static assets under /mf17052606 (icons etc.)
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