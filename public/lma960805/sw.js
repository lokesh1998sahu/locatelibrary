// LMA service worker — scope is restricted to /lma960805 (served from /lma960805/sw.js).
// It only handles requests under /lma960805, so other apps on this domain are untouched.
//
// v2: stores ONLY the fixed files below (icons + manifest) and a copy of each page
// for offline use. Everything else under /lma960805 — the page data Next.js fetches
// when you move between screens — always comes from the network, so a new deploy
// shows up at once and nothing out of date is ever served. The version bump makes
// the browser delete everything the old worker stored.
const CACHE = "lma960805-v2";
const SHELL = ["/lma960805", "/lma960805/manifest.webmanifest",
  "/lma960805/icons/icon-192.png", "/lma960805/icons/icon-512.png"];
const isStatic = (p) => p === "/lma960805/manifest.webmanifest" || p.startsWith("/lma960805/icons/");

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

  // Network-first for page loads (always fresh app), fall back to cache offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match("/lma960805")))
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