import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/worker.js';

const mockCache = {
  match: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
};

describe('Worker Rate Limiting', () => {
  let mockFetch;
  let mockEnv;
  let mockCtx;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('caches', { default: mockCache });

    mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', mockFetch);

    mockEnv = { ENVIRONMENT: 'test' };
    mockCtx = { waitUntil: vi.fn() };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('triggers 429 after exceeding limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000); // Start at a fixed time

    const ip = '10.0.0.1';

    // Send 1000 requests to exhaust limit
    // To speed up we do not expect on every single request
    const promises = [];
    for (let i = 0; i < 1000; i++) {
       const req = new Request('https://circuit-weather.racing/api/f1/current', {
         headers: new Headers({
           'CF-Connecting-IP': ip,
           'Sec-Fetch-Site': 'same-origin'
         })
       });
       promises.push(worker.fetch(req, mockEnv, mockCtx));
    }

    const responses = await Promise.all(promises);
    expect(responses[999].status).toBe(200);

    // 1001st request should be rate-limited
    const req = new Request('https://circuit-weather.racing/api/f1/current', {
       headers: new Headers({
         'CF-Connecting-IP': ip,
         'Sec-Fetch-Site': 'same-origin'
       })
    });
    const res = await worker.fetch(req, mockEnv, mockCtx);

    vi.useRealTimers();

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');

    const data = await res.json();
    expect(data.error.message).toBe('Too many requests');
  });
});
