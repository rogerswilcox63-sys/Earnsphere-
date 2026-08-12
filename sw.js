// sw.js – Basic offline cache for EarnSphere

const CACHE_NAME = 'earnsphere-v1';
const urlsToCache = [
  '/dashboard.html',
  '/admin.html',
  '/survey.html',
  '/take-survey.html',
  '/notifications.html',
  '/refer.html',
  '/login.html',
  '/register.html',
  '/community.html',
  '/profile.html',
  '/settings.html',
  '/withdraw.html',
  '/manifest.json',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap'
];

// Install – cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate – clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch – serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(() => {
        // Optional fallback offline page
        return caches.match('/dashboard.html');
      })
  );
});