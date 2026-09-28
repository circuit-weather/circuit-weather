import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SW_SOURCE = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8');
const ORIGIN = 'https://circuit-weather.racing';

/**
 * Evaluates public/sw.js against a minimal service worker global scope and
 * returns its fetch handler plus the mocks it talks to.
 */
function loadServiceWorker() {
    const listeners = {};
    const cache = { put: vi.fn(), addAll: vi.fn() };
    const caches = {
        open: vi.fn().mockResolvedValue(cache),
        match: vi.fn().mockResolvedValue(undefined),
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
    };
    const self = {
        location: { origin: ORIGIN },
        addEventListener: (type, fn) => { listeners[type] = fn; },
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
    };
    const fetch = vi.fn();
    new Function('self', 'caches', 'fetch', SW_SOURCE)(self, caches, fetch);
    return { onFetch: listeners.fetch, cache, caches, fetch };
}

function fetchEvent(path, { method = 'GET', mode = 'no-cors' } = {}) {
    const request = { url: `${ORIGIN}${path}`, method, mode };
    return { request, respondWith: vi.fn() };
}

describe('service worker fetch strategy', () => {
    let sw;

    beforeEach(() => {
        sw = loadServiceWorker();
    });

    it('serves same-origin assets from the network even when a cached copy exists', async () => {
        // A stale module in the cache must not shadow the deployed one, or new
        // code can run against an old locale file and render raw i18n keys.
        const fresh = { status: 200, clone: () => 'fresh-clone' };
        sw.fetch.mockResolvedValue(fresh);
        sw.caches.match.mockResolvedValue({ status: 200, stale: true });

        const event = fetchEvent('/src/i18n/locales/en.js');
        sw.onFetch(event);
        const response = await event.respondWith.mock.calls[0][0];

        expect(response).toBe(fresh);
        expect(sw.caches.match).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(sw.cache.put).toHaveBeenCalledWith(event.request, 'fresh-clone'));
    });

    it('does not cache unsuccessful responses', async () => {
        const notFound = { status: 404, clone: vi.fn() };
        sw.fetch.mockResolvedValue(notFound);

        const event = fetchEvent('/missing.js');
        sw.onFetch(event);

        expect(await event.respondWith.mock.calls[0][0]).toBe(notFound);
        expect(notFound.clone).not.toHaveBeenCalled();
    });

    it('falls back to the cache when offline', async () => {
        const cached = { status: 200 };
        sw.fetch.mockRejectedValue(new TypeError('offline'));
        sw.caches.match.mockResolvedValue(cached);

        const event = fetchEvent('/styles.css');
        sw.onFetch(event);

        expect(await event.respondWith.mock.calls[0][0]).toBe(cached);
    });

    it('falls back to the app shell for uncached navigations when offline', async () => {
        const shell = { status: 200, shell: true };
        sw.fetch.mockRejectedValue(new TypeError('offline'));
        sw.caches.match.mockImplementation(async (req) => (req === '/' ? shell : undefined));

        const event = fetchEvent('/f1/5/race', { mode: 'navigate' });
        sw.onFetch(event);

        expect(await event.respondWith.mock.calls[0][0]).toBe(shell);
    });

    it('leaves API, cross-origin and non-GET requests to the browser', () => {
        const api = fetchEvent('/api/radar');
        const post = fetchEvent('/', { method: 'POST' });
        const external = { request: { url: 'https://unpkg.com/leaflet.js', method: 'GET' }, respondWith: vi.fn() };

        [api, post, external].forEach((event) => sw.onFetch(event));

        expect(api.respondWith).not.toHaveBeenCalled();
        expect(post.respondWith).not.toHaveBeenCalled();
        expect(external.respondWith).not.toHaveBeenCalled();
    });
});
