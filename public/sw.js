// Minimal service worker for offline shell + cache-first static assets.
// Intentionally simple — we never cache HTML pages (always fresh) but do
// cache /_next/static, fonts, and the icons.
const CACHE = "seo-tool-shell-v1";
const STATIC = ["/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(STATIC);
      } catch {
        // ignore — manifests can 404 in dev
      }
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cache-first for static Next.js assets
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static") ||
      url.pathname.startsWith("/icon-") ||
      url.pathname === "/manifest.webmanifest")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return new Response("Offline", { status: 503 });
        }
      })(),
    );
    return;
  }

  // Network-first for everything else; fall back to cache when offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          return new Response("Offline", { status: 503 });
        }
      })(),
    );
  }
});
