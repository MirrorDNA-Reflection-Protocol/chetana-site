/**
 * Chetana Service Worker — Offline-First Scam Detection + Share Target
 *
 * Caches the app shell + pattern data so users can scan text
 * even without internet. Audio/media scans require the server,
 * but text pattern matching works fully offline.
 *
 * Handles Web Share Target API for receiving shared content
 * from other apps (WhatsApp, Messages, Gallery, etc).
 */
const CACHE_NAME = "chetana-v3";
const OFFLINE_URLS = [
  "/",
  "/index.html",
  "/logo.png",
  "/ting.wav",
];

// Install: cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: handle share target POSTs, API calls, and asset caching
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── Share Target: intercept POST from Android share sheet ──
  if (url.searchParams.has("share") && event.request.method === "POST") {
    event.respondWith(handleShareTarget(event));
    return;
  }

  // API calls: network only (don't cache scan results)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: "offline", message: "You're offline. Text scanning still works — paste any message and Chetana will check it locally." }), {
          headers: { "Content-Type": "application/json" },
          status: 503,
        })
      )
    );
    return;
  }

  // Assets: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".png") || url.pathname.endsWith(".jpg"))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match("/index.html")
      );
    })
  );
});

/**
 * Handle share target POST — extract shared text/url/files,
 * store in a temporary cache, redirect to app with share params.
 * The app reads from the cache on load.
 */
async function handleShareTarget(event) {
  const formData = await event.request.formData();
  const title = formData.get("title") || "";
  const text = formData.get("text") || "";
  const sharedUrl = formData.get("url") || "";
  const files = formData.getAll("media");

  // Build the shared content payload
  const payload = { title, text, url: sharedUrl, hasFiles: files.length > 0 };

  // Store files in cache if present
  if (files.length > 0) {
    const cache = await caches.open("chetana-share");
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const response = new Response(file, {
        headers: { "Content-Type": file.type, "X-Filename": file.name },
      });
      await cache.put(`/shared-file-${i}`, response);
    }
    payload.fileCount = files.length;
  }

  // Store text payload in cache for the app to read
  const cache = await caches.open("chetana-share");
  await cache.put("/shared-payload", new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  }));

  // Redirect to app with share flag — app will read from chetana-share cache
  const combined = [title, text, sharedUrl].filter(Boolean).join(" ");
  const redirectUrl = `/?share=true&shared_text=${encodeURIComponent(combined)}`;
  return Response.redirect(redirectUrl, 303);
}
