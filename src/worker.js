/**
 * Cloudflare Worker with Asset Handling
 * 
 * Handles:
 * 1. API proxy requests to /api/f1/*
 * 
 * Static assets and SPA fallback are handled by Cloudflare's asset configuration
 * via wrangler.toml's run_worker_first and not_found_handling settings.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Only /api/f1/* routes reach this worker (configured via run_worker_first)
    if (path.startsWith('/api/f1/')) {
      return handleApiRequest(request, env, ctx);
    }

    // Handle radar requests
    if (path === '/api/radar') {
      return handleRadarRequest(request, env, ctx);
    }

    // Handle track requests
    if (path.startsWith('/api/track/')) {
      return handleTrackRequest(request, env, ctx);
    }

    // For any other /api/* routes, return 404
    return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Handle F1 API requests with caching
 */
async function handleApiRequest(request, env, ctx) {
  const url = new URL(request.url);
  // Extract path parameters after /api/f1/
  // e.g. /api/f1/current -> current
  const apiPath = url.pathname.replace('/api/f1/', '');

  // Validate apiPath to prevent directory traversal
  if (apiPath.includes('..') || apiPath.includes('//') || apiPath.startsWith('/') || decodeURIComponent(apiPath).includes('..')) {
    return new Response(JSON.stringify({ error: 'Invalid API path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build upstream URL
  const upstreamUrl = `https://api.jolpi.ca/ergast/f1/${apiPath}`;

  // Cache key based on the full upstream URL
  const cacheKey = new Request(upstreamUrl, request);
  const cache = caches.default;

  // Check cache match
  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  // Fetch from upstream
  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CircuitWeather/1.0',
      },
    });

    if (!upstreamResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Upstream API error',
        status: upstreamResponse.status,
      }), {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const responseBody = await upstreamResponse.text();

    // Create cacheable response (1 hour)
    response = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
      },
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch from upstream',
      message: error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
      }
    });
  }
}

/**
 * Handle Track GeoJSON requests with caching
 */
async function handleTrackRequest(request, env, ctx) {
  const url = new URL(request.url);
  // Extract geoJsonId from /api/track/:id
  const trackId = url.pathname.replace('/api/track/', '');

  // Validation
  if (!trackId || trackId.includes('..') || trackId.includes('/') || !/^[a-z0-9-]+$/.test(trackId)) {
    return new Response(JSON.stringify({ error: 'Invalid track ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const upstreamUrl = `https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/${trackId}.geojson`;

  // Use a canonical cache key based on the upstream URL
  // This ensures the cache is shared regardless of client query params
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // Check cache match
  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');
    headers.set('Access-Control-Allow-Origin', '*');
    // Ensure client caches this for a long time too (24h)
    headers.set('Cache-Control', 'public, max-age=86400');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'CircuitWeather/1.0',
      },
    });

    if (!upstreamResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Track not found',
        status: upstreamResponse.status,
      }), {
        status: upstreamResponse.status === 404 ? 404 : 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const responseBody = await upstreamResponse.text();

    // Create cacheable response (24 hours - tracks are static)
    response = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
      },
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch track data',
      message: error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}

/**
 * Handle RainViewer API requests with caching
 */
async function handleRadarRequest(request, env, ctx) {
  const upstreamUrl = 'https://api.rainviewer.com/public/weather-maps.json';
  // Canonical cache key (ignore client headers/methods, just the URL)
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // Check cache match
  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');
    headers.set('Access-Control-Allow-Origin', '*');
    // Override Cache-Control for the client to ensure frequent checks (1 min)
    headers.set('Cache-Control', 'public, max-age=60');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CircuitWeather/1.0',
      },
    });

    if (!upstreamResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Upstream Radar API error',
        status: upstreamResponse.status,
      }), {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const responseBody = await upstreamResponse.text();

    // 1. Prepare Response for Cache (1 minute)
    // We cache for only 1 minute to ensure we stay close to real-time.
    // RainViewer updates every 10 mins, but we don't know the phase offset.
    const cacheResponse = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // Worker Cache TTL
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
      },
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));

    // 2. Prepare Response for Client (1 minute)
    const clientResponse = new Response(responseBody, {
        status: 200,
        headers: {
          ...Object.fromEntries(cacheResponse.headers),
          'Cache-Control': 'public, max-age=60', // Client TTL
        }
    });

    return clientResponse;

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch radar data',
      message: error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}
