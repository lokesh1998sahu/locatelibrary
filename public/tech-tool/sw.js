// Tech Tool service worker — scope is restricted to /tech-tool (served from
// /tech-tool/sw.js, registered with scope "/tech-tool" + Service-Worker-Allowed
// header). It only handles requests under /tech-tool, so the other apps on this
// domain (/lma, /whatsapp) are never touched.
const CACHE = "tech-tool-v1";
const SHELL = [
  "/tech-tool",
  "/tech-tool-manifest.json",
  "/tech-tool-icon-192.png",
  "/tech-tool-icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    // Only clean up OLD tech-tool caches. Never delete other apps' caches
    // (lma-v1, wa-open-v1) — that would break their offline support.
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith("tech-tool-") && k !== CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // ONLY handle same-origin requests under /tech-tool — ignore everything else.
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/tech-tool")) return;
  if (e.request.method !== "GET") return;

  // Network-first for navigations (always fresh app), fall back to cache offline.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("/tech-tool")))
    );
    return;
  }

  // Cache-first for static assets under /tech-tool (icons, manifest).
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ||
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached)
    )
  );
});
