
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
  delete: vi.fn(async (key) => cacheStore.delete(key)),
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

describe('Worker Logic', () => {
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

  describe('Router & Security', () => {
    it('returns 405 for non-GET/HEAD methods', async () => {
      const req = createRequest('/api/health', { method: 'POST' });
      const res = await worker.fetch(req, global.env, global.ctx);
      expect(res.status).toBe(405);
    });

    it('returns 404 for unknown routes', async () => {
      const req = createRequest('/api/unknown');
      const res = await worker.fetch(req, global.env, global.ctx);
      expect(res.status).toBe(404);
    });

    it('blocks hotlinking (invalid Origin/Referer)', async () => {
      const req = new Request('https://circuit-weather.racing/api/health', {
        headers: {}
      });
      const res = await worker.fetch(req, global.env, global.ctx);
      expect(res.status).toBe(403);
    });
  });

  describe('Health Check (/api/health)', () => {
    it('returns 200 and status ok', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        text: async () => 'ok'
      });

      const req = createRequest('/api/health');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
    });
  });

  describe('F1 API Proxy (/api/f1/*)', () => {
    it('proxies request to Jolpica and caches result', async () => {
      const upstreamData = { MRData: { raceTable: {} } };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(upstreamData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

      const req = createRequest('/api/f1/current');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(upstreamData);
      expect(mockCache.put).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.jolpi.ca/ergast/f1/current'),
        expect.any(Object)
      );
    });

    it('returns cached response if available', async () => {
      const cachedData = { cached: true };
      const cacheResponse = new Response(JSON.stringify(cachedData), {
        headers: { 'Content-Type': 'application/json' }
      });
      cacheStore.set('https://api.jolpi.ca/ergast/f1/current', cacheResponse);

      const req = createRequest('/api/f1/current');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(cachedData);
      expect(res.headers.get('X-Cache')).toBe('HIT');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('validates API path (blocks injection/traversal)', async () => {
      // Note: URL parsing normalizes path segments like /../ automatically.
      // We test a non-segment ".." to ensure the explicit check works.
      const req = createRequest('/api/f1/drivers/vet..tel');
      const res = await worker.fetch(req, global.env, global.ctx);
      expect(res.status).toBe(400);
    });
  });

  describe('Radar API (/api/radar)', () => {
    it('fetches rainviewer data and caches it', async () => {
      const mockRadarData = { version: '2.0', host: 'https://x.com', radar: {} };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockRadarData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

      const req = createRequest('/api/radar');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(mockRadarData);
      expect(mockCache.put).toHaveBeenCalled();
    });

    it('handles upstream errors gracefully (empty response)', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Error', { status: 500 }));

      const req = createRequest('/api/radar');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(200);
      const data = await res.json();
      // Ensure we get the empty radar structure defined in getEmptyRadarResponse
      expect(data.radar).toBeDefined();
      expect(data.radar.past).toEqual([]);
      expect(res.headers.get('X-Upstream-Status')).toBe('500');
    });
  });

  describe('Track Proxy (/api/track/*)', () => {
    it('fetches geojson from github', async () => {
      const mockGeoJson = { type: 'FeatureCollection', features: [] };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockGeoJson), {
        status: 200,
      }));

      const req = createRequest('/api/track/monaco');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(mockGeoJson);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('bacinger/f1-circuits/master/circuits/monaco.geojson'),
        expect.any(Object)
      );
    });

    it('validates track ID', async () => {
      const req = createRequest('/api/track/invalid<script>');
      const res = await worker.fetch(req, global.env, global.ctx);
      expect(res.status).toBe(400);
    });
  });

  describe('Leaflet Assets Proxy (/api/assets/*)', () => {
    // Valid hash for leaflet.js from worker.js
    const VALID_HASH_B64 = '20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';

    // Helper to setup crypto mock to return matching or mismatching hash
    const setupCryptoMock = (shouldMatch) => {
      const buffer = shouldMatch
        ? Uint8Array.from(atob(VALID_HASH_B64), c => c.charCodeAt(0)).buffer
        : new ArrayBuffer(32); // Random empty buffer (mismatch)

      Object.defineProperty(global, 'crypto', {
        value: {
          subtle: {
            digest: vi.fn(async () => buffer)
          }
        },
        writable: true
      });
    };

    it('proxies valid asset with correct SRI', async () => {
      setupCryptoMock(true);

      const mockScript = 'console.log("leaflet")';
      mockFetch.mockResolvedValueOnce(new Response(mockScript, {
        status: 200,
        headers: { 'Content-Type': 'application/javascript' }
      }));

      const req = createRequest('/api/assets/leaflet.js');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/javascript');
      expect(mockCache.put).toHaveBeenCalled();
    });

    it('blocks asset with SRI mismatch', async () => {
      setupCryptoMock(false); // Returns random hash

      const mockScript = 'console.log("hacked")';
      mockFetch.mockResolvedValueOnce(new Response(mockScript, {
        status: 200,
        headers: { 'Content-Type': 'application/javascript' }
      }));

      const req = createRequest('/api/assets/leaflet.js');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(502); // Bad Gateway (SRI failed)
      expect(await res.text()).toContain('SRI Integrity Check Failed');
    });

    it('returns 404 for unknown asset', async () => {
      const req = createRequest('/api/assets/unknown.js');
      const res = await worker.fetch(req, global.env, global.ctx);
      expect(res.status).toBe(404);
    });
  });

  describe('Tile Proxy (/api/tiles/*)', () => {
    it('proxies valid png requests', async () => {
      const mockImage = new ArrayBuffer(10);
      mockFetch.mockResolvedValueOnce(new Response(mockImage, {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      }));

      const req = createRequest('/api/tiles/v2/radar/1/2/3/512/1/1_1.png');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
      expect(mockCache.put).toHaveBeenCalled();
    });

    it('blocks non-png requests', async () => {
      const req = createRequest('/api/tiles/hack.exe');
      const res = await worker.fetch(req, global.env, global.ctx);
      expect(res.status).toBe(400);
    });

    it('enforces strict upstream content-type (anti-sniffing)', async () => {
      mockFetch.mockResolvedValueOnce(new Response('<html>Error</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }));

      // The URL implies a png, but upstream returns html
      const req = createRequest('/api/tiles/v2/radar/1.png');
      const res = await worker.fetch(req, global.env, global.ctx);

      expect(res.status).toBe(502); // Bad Gateway
    });
  });

});
