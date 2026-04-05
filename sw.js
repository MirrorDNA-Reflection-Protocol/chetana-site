const CACHE = "chetana-v2";
const ASSETS = ["/", "/index.html", "/img/logo.png", "/img/hero-phone.png", "/icon-192x192.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});