
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

// Mock Crypto (needed for worker imports)
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn(async () => new ArrayBuffer(32))
    }
  },
  writable: true
});

describe('Worker Health Check Caching', () => {
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

  const createRequest = (path) => {
    const url = `https://circuit-weather.racing${path}`;
    const headers = new Headers();
    headers.set('Sec-Fetch-Site', 'same-origin');
    return new Request(url, {
      method: 'GET',
      headers: headers,
    });
  };

  it('serves subsequent requests from cache (cache hit)', async () => {
    // Mock upstream responses
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => 'ok'
    });

    // First Request (Cache Miss)
    const req1 = createRequest('/api/health');
    const res1 = await worker.fetch(req1, global.env, global.ctx);
    expect(res1.status).toBe(200);
    // Should call 3 upstreams
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Should save to cache
    expect(mockCache.put).toHaveBeenCalled();

    // Verify headers
    expect(res1.headers.get('Cache-Control')).toBe('public, max-age=60');

    // Second Request (Cache Hit)
    const req2 = createRequest('/api/health');
    const res2 = await worker.fetch(req2, global.env, global.ctx);
    expect(res2.status).toBe(200);

    // Should NOT call any more upstreams
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Should return cache hit
    expect(res2.headers.get('X-Cache')).toBe('HIT');
  });

  it('returns CORS headers for valid origin and handles upstream fetch failure', async () => {
    // Simulate one upstream succeeding and one failing
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    mockFetch.mockRejectedValueOnce(new Error('Network Error'));
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));

    const req = new Request('https://circuit-weather.racing/api/health', {
      method: 'GET',
      headers: {
        'Origin': 'https://circuit-weather.racing',
        'Sec-Fetch-Site': 'same-origin'
      }
    });

    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://circuit-weather.racing');
    expect(res.headers.get('Vary')).toBe('Origin');

    const data = await res.json();
    expect(data.upstreams.jolpica).toBeDefined();
    expect(data.upstreams.rainviewer).toBeDefined();
    expect(data.upstreams.github).toBeDefined();
    // One of them will be 'unreachable'
    const values = Object.values(data.upstreams);
    expect(values).toContain('unreachable');
  });

  it('serves cache hit with CORS for valid origin', async () => {
    // Set a mock cache response
    const cacheResponse = new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    cacheStore.set('https://circuit-weather.racing/api/health', cacheResponse);

    const req = new Request('https://circuit-weather.racing/api/health', {
      method: 'GET',
      headers: {
        'Origin': 'https://circuit-weather.racing',
        'Sec-Fetch-Site': 'same-origin'
      }
    });

    const res = await worker.fetch(req, global.env, global.ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://circuit-weather.racing');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
