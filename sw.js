const CACHE = "altbrief-github-v1";
const OFFLINE_FILES = ["./", "./styles.css", "./app.js", "./manifest.json", "./news.json", "./icon-192.png", "./icon-512.png"];
const resolve = (path) => new URL(path, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_FILES.map(resolve))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isNews = url.pathname.endsWith("/data/news.json");
  if (isNews) {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(resolve("./news.json")))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response;
  })).catch(() => caches.match(resolve("./"))));
});
