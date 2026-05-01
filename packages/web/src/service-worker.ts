/// <reference lib="webworker" />

const CACHE_NAME = 'atlas-workbench-v1';
const API_CACHE_NAME = 'atlas-api-cache-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
];

const API_PATTERNS = [
  '/v1/cases',
  '/v1/sla/dashboard',
  '/v1/health',
];

// Install event: cache static assets
self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
});

// Activate event: clean old caches
self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

// Fetch event: stale-while-revalidate for API calls
self.addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url);

  // Stale-while-revalidate for API calls
  if (API_PATTERNS.some((pattern) => url.pathname.startsWith(pattern))) {
    event.respondWith(
      caches.open(API_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cachedResponse || new Response('{"error":"offline"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }));

        return cachedResponse || fetchPromise;
      }),
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});

export {};
