// MF 2.0 service worker — scope is restricted to /mf17052606 (served from
// /mf17052606/sw.js). It only handles requests under /mf17052606, so LMA and
// anything else on this domain are untouched.
//
// v2: stores ONLY the fixed files (icons + manifest) and a copy of each page for
// offline use. Everything else under /mf17052606 — the page data Next.js fetches
// when you move between screens — always comes from the network, so a new deploy
// shows up at once and nothing out of date is ever served. The version bump makes
// the browser delete everything the old worker stored.
const CACHE = "mf17052606-v2";
const SHELL = ["/mf17052606", "/mf17052606/manifest.webmanifest",
  "/mf17052606/icons/icon-192.png", "/mf17052606/icons/icon-512.png"];
const isStatic = (p) => p === "/mf17052606/manifest.webmanifest" || p.startsWith("/mf17052606/icons/");

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

  // Network-first for page loads (always fresh app), fall back to cache offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match("/mf17052606")))
    );
    return;
  }

  // Cache-first ONLY for the fixed files (icons, manifest).
  if (isStatic(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
          }
          return res;
        }).catch(() => cached)
      )
    );
    return;
  }

  // Everything else (page data, prefetches): not handled here, so the browser
  // fetches it normally from the network and nothing is stored.
});