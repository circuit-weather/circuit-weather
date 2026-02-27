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

describe('Worker Logic - Tile Errors', () => {
  let mockFetch;

  beforeEach(() => {
    cacheStore.clear();
    vi.clearAllMocks();

    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Minimal environment setup
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
    // Add default security headers to pass initial checks if needed,
    // though for these tests we mostly care about upstream behavior.
    if (!headers.has('Sec-Fetch-Site')) {
      headers.set('Sec-Fetch-Site', 'same-origin');
    }
    return new Request(url, {
      method: options.method || 'GET',
      headers: headers,
    });
  };

  it('handles upstream rate limit (429) for tiles and preserves Retry-After', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Rate Limit' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '120'
      }
    }));

    const req = createRequest('/api/tiles/v2/radar/1/2/3/512/1/1_1.png');
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('120');
    expect(res.headers.get('X-Upstream-Status')).toBe('429');

    // Should NOT cache 429
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('handles upstream server error (500) for tiles', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/html' }
    }));

    const req = createRequest('/api/tiles/v2/radar/1/2/3/512/1/1_1.png');
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(500);
    expect(res.headers.get('X-Upstream-Status')).toBe('500');

    // Should NOT cache 500
    expect(mockCache.put).not.toHaveBeenCalled();

    const data = await res.json();
    expect(data.error).toBe('Upstream tile error');
    expect(data.status).toBe(500);
  });

  it('handles network exception for tiles', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const req = createRequest('/api/tiles/v2/radar/1/2/3/512/1/1_1.png');
    const res = await worker.fetch(req, global.env, global.ctx);

    expect(res.status).toBe(502);
    expect(await res.text()).toBe('Tile proxy failed');
  });
});
