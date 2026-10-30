import { describe, it, expect } from 'vitest';
import { handleConfigRequest } from '../src/handlers/config.js';

describe('Config Handler (src/handlers/config.js)', () => {
  const createRequest = (path = '/api/config', headersInit = {}) => {
    const url = `https://circuit-weather.racing${path}`;
    const headers = new Headers(headersInit);
    if (!headers.has('Sec-Fetch-Site')) {
      headers.set('Sec-Fetch-Site', 'same-origin');
    }
    return new Request(url, {
      method: 'GET',
      headers
    });
  };

  it('returns 200 JSON response with mapboxToken from env', async () => {
    const req = createRequest();
    const env = { MAPBOX_ACCESS_TOKEN: 'pk.test.123456' };

    const res = handleConfigRequest(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');

    const body = await res.json();
    expect(body).toEqual({
      mapboxToken: 'pk.test.123456'
    });
  });

  it('returns empty mapboxToken string if MAPBOX_ACCESS_TOKEN is missing or empty', async () => {
    const req = createRequest();

    const res1 = handleConfigRequest(req, {});
    const body1 = await res1.json();
    expect(body1.mapboxToken).toBe('');

    const res2 = handleConfigRequest(req, { MAPBOX_ACCESS_TOKEN: undefined });
    const body2 = await res2.json();
    expect(body2.mapboxToken).toBe('');
  });

  it('rejects invalid fetch destination with 403 status', async () => {
    const req = createRequest('/api/config', {
      'Sec-Fetch-Dest': 'script'
    });
    const env = { MAPBOX_ACCESS_TOKEN: 'pk.test.123456' };

    const res = handleConfigRequest(req, env);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe('Invalid fetch destination');
  });

  it('includes standard security headers in the response', () => {
    const req = createRequest();
    const env = { MAPBOX_ACCESS_TOKEN: 'pk.test.123456' };

    const res = handleConfigRequest(req, env);

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets CORS headers when valid Origin header is provided', () => {
    const req = createRequest('/api/config', {
      Origin: 'https://circuit-weather.racing'
    });
    const env = { MAPBOX_ACCESS_TOKEN: 'pk.test.123456' };

    const res = handleConfigRequest(req, env);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://circuit-weather.racing');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('does not set Access-Control-Allow-Origin header for unauthorized Origin', () => {
    const req = createRequest('/api/config', {
      Origin: 'https://unauthorized-domain.com'
    });
    const env = { MAPBOX_ACCESS_TOKEN: 'pk.test.123456' };

    const res = handleConfigRequest(req, env);

    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});
