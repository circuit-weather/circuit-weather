import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/worker.js';

// Mock Cache API
const cacheStore = new Map();
const mockCache = {
  match: vi.fn(async (request) => cacheStore.get(request.url) || undefined),
  put: vi.fn(async (request, response) => {
    cacheStore.set(request.url, response.clone());
  }),
};
vi.stubGlobal('caches', { default: mockCache });

const createRequest = (path, headers = {}) => new Request(`https://circuit-weather.racing${path}`, {
  headers: { 'Sec-Fetch-Site': 'same-origin', ...headers },
});

const png = () => new Response(new ArrayBuffer(8), { status: 200, headers: { 'Content-Type': 'image/png' } });

describe('Worker LibreWXR routes', () => {
  let mockFetch;
  let env;
  let ctx;

  beforeEach(() => {
    cacheStore.clear();
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    env = { ENVIRONMENT: 'test' };
    ctx = { waitUntil: vi.fn() };
  });

  describe('/api/tiles/*', () => {
    it('proxies LibreWXR radar tiles with allowed overlays only', async () => {
      mockFetch.mockResolvedValueOnce(png());

      const res = await worker.fetch(
        createRequest('/api/tiles/v2/radar/1000/512/10/3/4/2/1_1.png?cells=dark&arrows=dark&evil=1'),
        env, ctx
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=7200');
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.librewxr.net/v2/radar/1000/512/10/3/4/2/1_1.png?arrows=dark&cells=dark'
      );
    });

    it('caches nowcast tiles for 5 minutes under a separate key', async () => {
      mockFetch.mockResolvedValueOnce(png());
      const future = Math.floor(Date.now() / 1000) + 1800;

      const res = await worker.fetch(
        createRequest(`/api/tiles/v2/radar/${future}/512/8/3/4/2/1_1.png?nowcast=1`), env, ctx
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
      expect(mockFetch.mock.calls[0][0]).toBe(`https://api.librewxr.net/v2/radar/${future}/512/8/3/4/2/1_1.png`);
      expect(cacheStore.has(`https://api.librewxr.net/v2/radar/${future}/512/8/3/4/2/1_1.png?cw-nowcast=1`)).toBe(true);
    });

    it('routes RainViewer fallback tiles to RainViewer', async () => {
      mockFetch.mockResolvedValueOnce(png());

      const res = await worker.fetch(createRequest('/api/tiles/rainviewer/v2/radar/abc/512/6/3/4/2/1_1.png'), env, ctx);

      expect(res.status).toBe(200);
      expect(mockFetch.mock.calls[0][0]).toBe('https://tilecache.rainviewer.com/v2/radar/abc/512/6/3/4/2/1_1.png');
    });

    it('rejects unknown tile shapes without contacting upstream', async () => {
      const res = await worker.fetch(createRequest('/api/tiles/v2/radar/1000/512/14/3/4/2/1_1.png'), env, ctx);

      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toBe('Invalid tile path');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('/api/alerts', () => {
    const UPSTREAM = 'https://api.librewxr.net/v2/alerts?bbox=-3,50.1,1,54.1&simplify=1000';
    const alertsBody = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 52], [1, 52], [1, 53], [0, 52]]] },
        properties: { title: 'Heavy rain', severity: 'Moderate', expires: '4102444800', uri: 'https://example.org' },
      }],
    };
    const geoJson = (body, headers = {}) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/geo+json', ...headers },
    });

    it('proxies sanitised alerts for a box around the circuit and caches them', async () => {
      mockFetch.mockResolvedValueOnce(geoJson(alertsBody));

      const res = await worker.fetch(
        createRequest('/api/alerts?lat=52.07&lon=-1.02', { Origin: 'https://circuit-weather.racing' }), env, ctx
      );

      expect(res.status).toBe(200);
      expect(mockFetch.mock.calls[0][0]).toBe(UPSTREAM);
      expect(res.headers.get('Content-Type')).toBe('application/geo+json');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://circuit-weather.racing');
      const data = await res.json();
      expect(data.features).toHaveLength(1);
      expect(data.features[0].properties.severity).toBe('moderate');
      expect(cacheStore.has(UPSTREAM)).toBe(true);
    });

    it('serves cached alerts without contacting upstream', async () => {
      cacheStore.set(UPSTREAM, geoJson({ type: 'FeatureCollection', features: [] }));

      const res = await worker.fetch(createRequest('/api/alerts?lat=52.07&lon=-1.02'), env, ctx);

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Cache')).toBe('HIT');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('accepts application/json from upstream', async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(alertsBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }));

      const res = await worker.fetch(createRequest('/api/alerts?lat=52.07&lon=-1.02'), env, ctx);
      expect(res.status).toBe(200);
    });

    it('rejects invalid coordinates', async () => {
      const res = await worker.fetch(createRequest('/api/alerts?lat=999&lon=0'), env, ctx);
      expect(res.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('blocks requests with an invalid fetch destination', async () => {
      const res = await worker.fetch(
        createRequest('/api/alerts?lat=1&lon=1', { 'Sec-Fetch-Dest': 'script' }), env, ctx
      );
      expect(res.status).toBe(403);
    });

    it('returns 502 on upstream errors', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch.mockResolvedValueOnce(new Response('down', { status: 503 }));

      const res = await worker.fetch(createRequest('/api/alerts?lat=1&lon=1'), env, ctx);

      expect(res.status).toBe(502);
      expect(res.headers.get('X-Upstream-Status')).toBe('503');
      expect(errorSpy).toHaveBeenCalledWith('Upstream Alerts API Error: Status 503');
      expect(mockCache.put).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('rejects non-JSON upstream responses', async () => {
      mockFetch.mockResolvedValueOnce(new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));

      const res = await worker.fetch(createRequest('/api/alerts?lat=1&lon=1'), env, ctx);

      expect(res.status).toBe(502);
      expect((await res.json()).error.message).toBe('Invalid upstream alerts response');
    });

    it('rejects oversized upstream responses by declared length', async () => {
      mockFetch.mockResolvedValueOnce(geoJson(alertsBody, { 'Content-Length': String(6 * 1024 * 1024) }));

      const res = await worker.fetch(createRequest('/api/alerts?lat=1&lon=1'), env, ctx);
      expect(res.status).toBe(502);
    });

    it('rejects oversized upstream bodies without a declared length', async () => {
      mockFetch.mockResolvedValueOnce(new Response('x'.repeat(5 * 1024 * 1024 + 1), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

      const res = await worker.fetch(createRequest('/api/alerts?lat=1&lon=1'), env, ctx);
      expect(res.status).toBe(502);
    });

    it('returns 502 when the upstream fetch fails or the body is not JSON', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(new Response('{not json', { status: 200, headers: { 'Content-Type': 'application/json' } }));

      const first = await worker.fetch(createRequest('/api/alerts?lat=1&lon=1'), env, ctx);
      const second = await worker.fetch(createRequest('/api/alerts?lat=1&lon=1'), env, ctx);

      expect(first.status).toBe(502);
      expect(second.status).toBe(502);
      expect((await second.json()).error.message).toBe('Failed to fetch weather alerts');
      expect(errorSpy).toHaveBeenCalledWith('Alerts Fetch Error:', expect.any(Error));
      errorSpy.mockRestore();
    });

    it('does not log in production', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch
        .mockResolvedValueOnce(new Response('down', { status: 500 }))
        .mockRejectedValueOnce(new Error('timeout'));
      const prod = { ENVIRONMENT: 'production' };

      await worker.fetch(createRequest('/api/alerts?lat=1&lon=1'), prod, ctx);
      await worker.fetch(createRequest('/api/alerts?lat=1&lon=1'), prod, ctx);

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
