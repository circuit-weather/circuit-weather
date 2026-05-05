
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/worker.js';

// --- Mocks ---

// Mock Cache API
const cacheStore = new Map();
const mockCache = {
  match: vi.fn(async (request) => {
    const key = request.url;
    return cacheStore.get(key) || undefined;
  }),
  put: vi.fn(async (request, response) => {
    const key = request.url;
    cacheStore.set(key, response.clone());
    return Promise.resolve();
  }),
};

// Mock Global Caches
vi.stubGlobal('caches', {
  default: mockCache,
});

// Mock Crypto for SRI checks
// Use vi.stubGlobal or defineProperty since global.crypto is read-only in some envs
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn(async (algo, buffer) => {
        return new ArrayBuffer(32);
      })
    }
  },
  writable: true
});

// --- Tests ---

describe('Worker Security: Strict Content-Type Validation', () => {
  let mockFetch;

  beforeEach(() => {
    cacheStore.clear();
    vi.clearAllMocks();

    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    vi.stubGlobal('env', { ENVIRONMENT: 'test' });
    vi.stubGlobal('ctx', {
      waitUntil: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createRequest = (path, options = {}) => {
    const url = `https://circuit-weather.racing${path}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Sec-Fetch-Site')) {
      headers.set('Sec-Fetch-Site', 'same-origin');
    }
    return new Request(url, {
      method: options.method || 'GET',
      headers: headers,
    });
  };

  describe('F1 API Proxy (/api/f1/*)', () => {
    it('allows application/json; charset=utf-8', async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));

      const req = createRequest('/api/f1/current');
      const res = await worker.fetch(req, global.env, global.ctx);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/json'); // Worker strips charset in cache headers
    });

    it('blocks deceptive type: application/jsonp', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce(new Response('callback({})', {
        status: 200,
        headers: { 'Content-Type': 'application/jsonp' }
      }));

      const req = createRequest('/api/f1/current');
      const res = await worker.fetch(req, global.env, global.ctx);

      // Should fail if loose matching is used (includes 'application/json')
      // Currently fails (returns 200) because validation is loose.
      // After fix, should return 502.
      if (res.status === 200) {
        throw new Error('FAILED: Accepted application/jsonp');
      }
      expect(res.status).toBe(502);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('blocks deceptive type: application/json-evil', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockFetch.mockResolvedValueOnce(new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json-evil' }
        }));

        const req = createRequest('/api/f1/current');
        const res = await worker.fetch(req, global.env, global.ctx);

        if (res.status === 200) {
            throw new Error('FAILED: Accepted application/json-evil');
        }
        expect(res.status).toBe(502);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
      });
  });

  describe('Radar API Proxy (/api/radar)', () => {
    it('blocks deceptive type: application/json-evil', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce(new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json-evil' }
      }));

      const req = createRequest('/api/radar');
      const res = await worker.fetch(req, global.env, global.ctx);

      // Check if it returned the "empty radar" response which is used for errors
      // The current implementation returns getEmptyRadarResponse() on error.
      // So status is 200, but content is empty radar.
      const data = await res.json();

      // If validation fails, it should return empty radar.
      // If validation passes (bug), it returns the upstream data ({}).
      // Wait, handleRadarRequest:
      // if (!contentType || !contentType.includes('application/json')) { return getEmptyRadarResponse(request); }
      // So if it accepts json-evil, it returns the upstream data.

      // Our mock returns {}, empty radar has radar: { past: [], ... }
      if (!data.radar) { // Upstream mocked data
          throw new Error('FAILED: Accepted application/json-evil (returned upstream data)');
      }

      // Correct behavior: returns empty radar structure
      expect(data.radar).toBeDefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('Track Proxy (/api/track/*)', () => {
    it('blocks deceptive type: text/html', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce(new Response('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }));

      const req = createRequest('/api/track/monaco');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(502);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('Vendor Assets Proxy (/api/assets/*)', () => {
    it('allows text/css; charset=utf-8', async () => {
        // Valid hash for leaflet.css
        const hash = 'p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        const buffer = Uint8Array.from(atob(hash), c => c.charCodeAt(0)).buffer;

        Object.defineProperty(global, 'crypto', {
            value: { subtle: { digest: vi.fn(async () => buffer) } },
            writable: true
        });

        mockFetch.mockResolvedValueOnce(new Response('css', {
            status: 200,
            headers: { 'Content-Type': 'text/css; charset=utf-8' }
        }));

        const req = createRequest('/api/assets/leaflet.css');
        const res = await worker.fetch(req, global.env, global.ctx);
        expect(res.status).toBe(200);
    });

    it('blocks deceptive type: text/javascript-evil', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        // Valid hash for leaflet.js
        const hash = '20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        const buffer = Uint8Array.from(atob(hash), c => c.charCodeAt(0)).buffer;

        Object.defineProperty(global, 'crypto', {
            value: { subtle: { digest: vi.fn(async () => buffer) } },
            writable: true
        });

        mockFetch.mockResolvedValueOnce(new Response('evil', {
            status: 200,
            headers: { 'Content-Type': 'text/javascript-evil' }
        }));

        const req = createRequest('/api/assets/leaflet.js');
        const res = await worker.fetch(req, global.env, global.ctx);

        if (res.status === 200) {
            throw new Error('FAILED: Accepted text/javascript-evil');
        }
        expect(res.status).toBe(502);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
  });

  describe('Tile Proxy (/api/tiles/*)', () => {
    it('allows image/png', async () => {
        mockFetch.mockResolvedValueOnce(new Response(new ArrayBuffer(10), {
            status: 200,
            headers: { 'Content-Type': 'image/png' }
        }));

        const req = createRequest('/api/tiles/test.png');
        const res = await worker.fetch(req, global.env, global.ctx);
        expect(res.status).toBe(200);
    });

    it('blocks deceptive type: image/png-evil', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockFetch.mockResolvedValueOnce(new Response(new ArrayBuffer(10), {
            status: 200,
            headers: { 'Content-Type': 'image/png-evil' }
        }));

        const req = createRequest('/api/tiles/test.png');
        const res = await worker.fetch(req, global.env, global.ctx);

        // handleTileRequest uses startsWith('image/png')
        // So image/png-evil passes!
        if (res.status === 200) {
            throw new Error('FAILED: Accepted image/png-evil');
        }
        expect(res.status).toBe(502);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
  });

});
