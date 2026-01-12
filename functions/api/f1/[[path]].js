/**
 * Cloudflare Pages Function - F1 API Proxy with Edge Caching
 * 
 * This function proxies requests to the Jolpica F1 API and caches
 * responses at Cloudflare's edge for improved performance.
 * 
 * Route: /api/f1/*
 */

export async function onRequest(context) {
  const { request, params, env } = context;

  // Build the upstream URL
  const path = params.path?.join('/') || 'current';
  const upstreamUrl = `https://api.jolpi.ca/ergast/f1/${path}`;

  // Cache key based on the path
  const cacheKey = new Request(upstreamUrl, request);
  const cache = caches.default;

  // Check cache first
  let response = await cache.match(cacheKey);

  if (response) {
    // Clone response and add cache header
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
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

    // Clone response for caching
    const responseBody = await upstreamResponse.text();

    // Create cacheable response with 1 hour TTL
    response = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*',
      },
    });

    // Store in cache (don't await - fire and forget)
    context.waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch from upstream',
      message: error.message,
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
