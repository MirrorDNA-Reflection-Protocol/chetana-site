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
const CACHE_NAME = "chetana-v7";
const SHARE_CACHE_NAME = "chetana-share";
const SHARE_FILE_FIELD_NAMES = ["media", "files", "file", "image", "images", "screenshot"];
const MAX_SHARED_FILES = 3;
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
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE_NAME)
          .map((k) => caches.delete(k)),
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch: handle share target POSTs, API calls, and asset caching
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── Share Target: intercept POST from Android share sheet ──
  if (
    event.request.method === "POST" &&
    (url.pathname === "/share-target" || url.searchParams.has("share"))
  ) {
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

  if (
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/version.json" ||
    url.pathname === "/.well-known/edge-truth.json"
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return caches.match("/index.html");
        })
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
  const title = stringField(formData, "title");
  const text = stringField(formData, "text");
  const sharedUrl = stringField(formData, "url");
  const { imageFiles, unsupportedFileTypes } = collectSharedFiles(formData);

  // Build the shared content payload
  const payload = {
    title,
    text,
    url: sharedUrl,
    hasFiles: imageFiles.length > 0,
    fileCount: imageFiles.length,
    unsupportedFileTypes,
  };

  // Store files in cache if present
  if (imageFiles.length > 0) {
    const cache = await caches.open(SHARE_CACHE_NAME);
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const response = new Response(file, {
        headers: {
          "Content-Type": file.type || "image/png",
          "X-Filename": safeHeaderValue(file.name || `shared-screenshot-${i + 1}.${imageExtensionForType(file.type)}`),
        },
      });
      await cache.put(`/shared-file-${i}`, response);
    }
  }

  // Store text payload in cache for the app to read
  const cache = await caches.open(SHARE_CACHE_NAME);
  await cache.put("/shared-payload", new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  }));

  // Redirect to app with share flag — app will read from chetana-share cache
  const redirectUrl = "/?share=true&source=share-target";
  return Response.redirect(redirectUrl, 303);
}

function stringField(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function collectSharedFiles(formData) {
  const seen = new Set();
  const candidates = [];

  for (const fieldName of SHARE_FILE_FIELD_NAMES) {
    for (const value of formData.getAll(fieldName)) {
      if (isBlobLike(value) && value.size > 0 && !seen.has(value)) {
        seen.add(value);
        candidates.push(value);
      }
    }
  }

  // Some Android/WebView share implementations use source-specific field names.
  for (const [, value] of formData.entries()) {
    if (isBlobLike(value) && value.size > 0 && !seen.has(value)) {
      seen.add(value);
      candidates.push(value);
    }
  }

  const imageFiles = candidates
    .filter((file) => (file.type || "").startsWith("image/"))
    .slice(0, MAX_SHARED_FILES);
  const unsupportedFileTypes = candidates
    .filter((file) => !(file.type || "").startsWith("image/"))
    .map((file) => file.type || "unknown");

  return { imageFiles, unsupportedFileTypes };
}

function isBlobLike(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function imageExtensionForType(type = "") {
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "png";
}

function safeHeaderValue(value) {
  return String(value || "")
    .replace(/[^\t\x20-\x7e]/g, "_")
    .slice(0, 160);
}
