const CACHE_NAME = "earnsphere-v1";

const urlsToCache = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/withdraw.html",
  "/profile.html",
  "/register.html",
  "/login.html",
  "/style.css",
  "/manifest.json",
  "/logo.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png"
];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(event.request).then((networkResponse) => {
          const responseClone = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

          return networkResponse;
        }).catch(() => {
          return caches.match("/index.html");
        })
      );
    })
  );
});