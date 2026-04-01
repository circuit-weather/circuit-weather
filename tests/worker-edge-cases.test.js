import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Worker Edge-Case Tests
 *
 * Tests the worker's behavior for:
 * - CORS preflight (OPTIONS) handling
 * - Health check endpoint
 * - Track request validation and caching
 * - Method enforcement
 * - Fetch timeout / network error outcomes
 *
 * These complement worker.test.js and worker-security.test.js by covering
 * previously-untested error paths and edge cases.
 */

// Import worker-utils for helper mocking
import {
    getErrorHeaders,
    getAllowedOrigin,
} from '../src/worker-utils.js';

// Import the worker default export
import workerModule from '../src/worker.js';

// Mock env/ctx
const createEnv = (overrides = {}) => ({
    ENVIRONMENT: 'test',
    ...overrides,
});

const createCtx = () => ({
    waitUntil: vi.fn(),
});

// Create a valid GET request
const createRequest = (path, options = {}) => {
    const url = `https://circuit-weather.pages.dev${path}`;
    return new Request(url, {
        method: options.method || 'GET',
        headers: new Headers({
            'Origin': 'https://circuit-weather.pages.dev',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Referer': 'https://circuit-weather.pages.dev/',
            ...(options.headers || {}),
        }),
    });
};

describe('Worker Edge Cases', () => {
    let env;
    let ctx;

    beforeEach(() => {
        vi.restoreAllMocks();
        env = createEnv();
        ctx = createCtx();

        // Mock the caches API
        const cacheStore = new Map();
        globalThis.caches = {
            default: {
                match: vi.fn(async (key) => cacheStore.get(key.url || key) || null),
                put: vi.fn(async (key, response) => {
                    cacheStore.set(key.url || key, response);
                }),
            }
        };
    });

    // ---------------------------------------------------------------
    // OPTIONS (CORS preflight)
    // ---------------------------------------------------------------
    describe('CORS preflight (OPTIONS)', () => {
        it('returns 204 with CORS headers', async () => {
            const request = createRequest('/api/f1/current', { method: 'OPTIONS' });
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(204);
            expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
            expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
        });

        it('reflects allowed origin', async () => {
            const request = createRequest('/api/f1/current', { method: 'OPTIONS' });
            const response = await workerModule.fetch(request, env, ctx);

            // Should have an origin header set
            const origin = response.headers.get('Access-Control-Allow-Origin');
            expect(origin).toBeTruthy();
        });
    });

    // ---------------------------------------------------------------
    // Method enforcement
    // ---------------------------------------------------------------
    describe('method enforcement', () => {
        it('rejects POST with 405', async () => {
            const request = createRequest('/api/f1/current', { method: 'POST' });
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(405);
            expect(response.headers.get('Allow')).toContain('GET');
        });

        it('rejects PUT with 405', async () => {
            const request = createRequest('/api/f1/current', { method: 'PUT' });
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(405);
        });

        it('rejects DELETE with 405', async () => {
            const request = createRequest('/api/f1/current', { method: 'DELETE' });
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(405);
        });
    });

    // ---------------------------------------------------------------
    // Health endpoint
    // ---------------------------------------------------------------
    describe('/api/health', () => {
        it('returns status ok with upstream checks', async () => {
            // Mock fetch for health check upstream queries
            const originalFetch = globalThis.fetch;
            globalThis.fetch = vi.fn().mockResolvedValue({
                status: 200,
                ok: true,
            });

            const request = createRequest('/api/health');
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.status).toBe('ok');
            expect(body.upstreams).toBeDefined();
            expect(body.timestamp).toBeTruthy();

            globalThis.fetch = originalFetch;
        });

        it('reports unreachable upstreams', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const originalFetch = globalThis.fetch;
            globalThis.fetch = vi.fn().mockRejectedValue(new Error('Timeout'));

            const request = createRequest('/api/health');
            const response = await workerModule.fetch(request, env, ctx);

            const body = await response.json();
            expect(body.upstreams.jolpica).toContain('unreachable');
            expect(body.upstreams.rainviewer).toContain('unreachable');

            globalThis.fetch = originalFetch;
            errorSpy.mockRestore();
        });
    });

    // ---------------------------------------------------------------
    // Track endpoint validation
    // ---------------------------------------------------------------
    describe('/api/track/:id', () => {
        it('rejects track ID with directory traversal', async () => {
            const request = createRequest('/api/track/foo..bar');
            const response = await workerModule.fetch(request, env, ctx);

            // Contains '..' so it's rejected by VALID_TRACK_ID_REGEX
            expect(response.status).toBe(400);
        });

        it('rejects track ID exceeding 50 characters', async () => {
            const longId = 'a'.repeat(51);
            const request = createRequest(`/api/track/${longId}`);
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(400);
        });

        it('rejects empty track ID', async () => {
            const request = createRequest('/api/track/');
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(400);
        });

        it('fetches valid track successfully', async () => {
            const geoJson = JSON.stringify({ type: 'Feature', geometry: {} });
            const originalFetch = globalThis.fetch;

            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: new Headers({ 'Content-Type': 'application/json' }),
                body: {
                    tee: () => [geoJson, geoJson],
                },
            });

            const request = createRequest('/api/track/bahrain');
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(200);

            globalThis.fetch = originalFetch;
        });

        it('returns 502 when upstream track fetch fails', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const originalFetch = globalThis.fetch;
            globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

            const request = createRequest('/api/track/bahrain');
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(502);

            globalThis.fetch = originalFetch;
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    // ---------------------------------------------------------------
    // Unknown API routes
    // ---------------------------------------------------------------
    describe('unknown API routes', () => {
        it('returns 404 for unregistered /api/* paths', async () => {
            const request = createRequest('/api/unknown-endpoint');
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(404);
            const body = await response.json();
            expect(body.error.message).toBe('API endpoint not found');
        });
    });

    // ---------------------------------------------------------------
    // Tile endpoint validation
    // ---------------------------------------------------------------
    describe('/api/tiles validation', () => {
        it('rejects non-PNG tile requests', async () => {
            const request = createRequest('/api/tiles/v2/radar/test.svg');
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.error.message).toBe('Invalid tile format');
        });

        it('rejects tile paths with dotfile segments', async () => {
            const request = createRequest('/api/tiles/.hidden/tile.png');
            const response = await workerModule.fetch(request, env, ctx);

            // Dotfile regex catches hidden segments
            expect(response.status).toBe(400);
        });

        it('rejects tile paths exceeding 255 characters', async () => {
            const longPath = '/v2/' + 'a'.repeat(252) + '.png';
            const request = createRequest(`/api/tiles${longPath}`);
            const response = await workerModule.fetch(request, env, ctx);

            expect(response.status).toBe(400);
        });
    });
});
