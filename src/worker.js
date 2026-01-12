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
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
