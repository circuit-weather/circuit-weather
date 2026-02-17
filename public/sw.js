/**
 * Circuit Weather - Service Worker
 * Provides installability and app shell caching for PWA support.
 *
 * Strategy:
 * - Cache-first for app shell (HTML, CSS, JS, icons)
 * - Network-only for API calls (weather data must be fresh)
 * - Network-first with cache fallback for navigation
 */

const CACHE_NAME = 'circuit-weather-v2';

// App shell resources to pre-cache on install
const APP_SHELL = [
    '/',
    '/styles.css',
    '/cw-app.js',
    '/theme.js',
    '/favicon.svg',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
];

// Install: Pre-cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Fetch: Route requests by type
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Network-only for API calls — weather data must be fresh
    if (url.pathname.startsWith('/api/')) return;

    // Network-only for external resources (CDNs, fonts, tiles, etc.)
    if (url.origin !== self.location.origin) return;

    // Cache-first for same-origin app shell assets
    event.respondWith(
        caches.match(event.request)
            .then((cached) => {
                if (cached) return cached;

                return fetch(event.request).then((response) => {
                    // Don't cache non-ok responses
                    if (!response || response.status !== 200) return response;

                    // Cache the fetched response for next time
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });

                    return response;
                });
            })
            .catch(() => {
                // If both cache and network fail for a navigation request,
                // return the cached index.html as a fallback
                if (event.request.mode === 'navigate') {
                    return caches.match('/');
                }
            })
    );
});
