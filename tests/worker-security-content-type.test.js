
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

      // A loose `includes('application/json')` check would accept this; the
      // strict MIME comparison must reject it as an upstream error.
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

        expect(res.status).toBe(502);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
      });
  });

  describe('Radar API Proxy (/api/radar)', () => {
    it('allows application/json; charset=utf-8 and proxies the upstream payload', async () => {
      // Distinctive payload so we can tell the proxied data apart from the
      // empty-radar fallback (which has past: []). Exercises the charset
      // normalization (split(';')[0]) on the radar handler.
      const upstream = { radar: { past: [{ time: 111 }], nowcast: [] }, host: 'up' };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(upstream), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));

      const req = createRequest('/api/radar');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.radar.past).toHaveLength(1);
      expect(data.radar.past[0].time).toBe(111);
    });

    it('blocks deceptive type: application/json-evil', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Non-empty upstream payload: if validation wrongly accepted the type the
      // proxied data (past length 1) would surface instead of the empty fallback.
      const upstream = { radar: { past: [{ time: 999 }], nowcast: [] }, host: 'up' };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(upstream), {
        status: 200,
        headers: { 'Content-Type': 'application/json-evil' }
      }));

      const req = createRequest('/api/radar');
      const res = await worker.fetch(req, global.env, global.ctx);

      // Rejected → safe empty-radar fallback, NOT the upstream payload.
      const data = await res.json();
      expect(data.radar.past).toEqual([]);
      expect(data.radar.nowcast).toEqual([]);
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

        // Strict comparison must reject image/png-evil (a startsWith check would
        // wrongly accept it).
        expect(res.status).toBe(502);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
  });

});
