/**
 * Circuit Weather - Service Worker
 * Provides installability and app shell caching for PWA support.
 *
 * Strategy:
 * - Network-first with cache fallback for same-origin assets (HTML, CSS, JS,
 *   icons). The frontend is unbundled ES modules, so serving any of them
 *   cache-first lets a deploy mix old and new modules (e.g. new code calling
 *   an i18n key that a stale cached locale file lacks), which is how raw
 *   keys like "controls.roundLabel" ended up in the UI.
 * - Network-only for API calls (weather data must be fresh)
 */

const CACHE_VERSION = '1.2.0';
const CACHE_NAME = `circuit-weather-v${CACHE_VERSION}`;

// App shell resources to pre-cache on install
const APP_SHELL = [
    '/',
    '/index.html',
    '/styles.css',
    '/src/main.js',
    '/src/config.js',
    '/src/CircuitWeatherApp.js',
    '/src/api/F1API.js',
    '/src/api/WeatherClient.js',
    '/src/map/MapManager.js',
    '/src/map/MapWeatherWidget.js',
    '/src/map/RangeCircles.js',
    '/src/map/WindOverlay.js',
    '/src/map/RecentreControl.js',
    '/src/map/TrackLayer.js',
    '/src/map/WeatherRadar.js',
    '/src/map/RadarErrorToast.js',
    '/src/map/RadarPlayback.js',
    '/src/routing/Router.js',
    '/src/ui/CountdownTimer.js',
    '/src/ui/PrivacyModal.js',
    '/src/ui/SidebarManager.js',
    '/src/ui/ThemeManager.js',
    '/src/utils/storage.js',
    '/src/utils/wind.js',
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

    // Network-first for same-origin assets; fall back to the cache offline
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Only cache complete, successful responses
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => caches.match(event.request).then((cached) => {
                if (cached) return cached;
                // Offline navigation to an uncached route: serve the app shell
                if (event.request.mode === 'navigate') {
                    return caches.match('/');
                }
                return Response.error();
            }))
    );
});
