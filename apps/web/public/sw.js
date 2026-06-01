// Rayalaseema News service worker - #92 PWA + offline cache.
//
// Strategy:
//   - epaper-shell: HTML for /epaper, /epaper/search, /epaper/corrections -
//     network-first, fall back to cache when offline.
//   - epaper-media: edition PDFs + per-page PNGs from Azure Blob - cache-first
//     so previously-opened editions work fully offline. LRU-capped to ~30
//     entries (~7 editions of pages + a few PDFs) to stay under storage quotas.
//   - static: app icons, manifest - stale-while-revalidate.
//   - everything else: network-only (don't cache article HTML - readers want
//     fresh news on reconnect).

const VERSION = "v1";
const SHELL_CACHE = `re-shell-${VERSION}`;
const MEDIA_CACHE = `re-media-${VERSION}`;
const STATIC_CACHE = `re-static-${VERSION}`;
const MEDIA_LIMIT = 30;

const SHELL_URLS = ["/epaper", "/epaper/corrections", "/epaper/search"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Best-effort precache - failures don't block install (offline-first dev mode).
    await Promise.all(SHELL_URLS.map((u) => fetch(u, { credentials: "same-origin" }).then((r) => r.ok && cache.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.endsWith(`-${VERSION}`)).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const reqs = await cache.keys();
  if (reqs.length <= max) return;
  // FIFO eviction - simple, good enough; perfect LRU needs metadata side-table.
  for (const req of reqs.slice(0, reqs.length - max)) await cache.delete(req);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  const isEpaperShell = url.origin === self.location.origin && /^\/epaper(\/|$)/.test(url.pathname);
  const isEpaperMedia =
    /\.(pdf|png|jpg|jpeg|webp)(\?|$)/.test(url.pathname) &&
    (url.hostname.includes("blob.core.windows.net") || url.hostname.includes("rayalaseemaexpress"));
  const isStatic = /^\/(icon|apple-icon|logo|manifest)/.test(url.pathname);

  if (isEpaperShell) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response("Offline - no cached copy of this page.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (isEpaperMedia) {
    event.respondWith((async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          cache.put(req, fresh.clone());
          // Trim asynchronously - don't delay the response.
          trimCache(MEDIA_CACHE, MEDIA_LIMIT);
        }
        return fresh;
      } catch {
        return new Response("Offline - this PDF/image is not cached.", { status: 503 });
      }
    })());
    return;
  }

  if (isStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
      return cached || (await networkPromise) || new Response("", { status: 504 });
    })());
    return;
  }

  // Default: network-only (don't shadow live article HTML with stale cache).
});
