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

    // Handle weather requests
    if (path === '/api/weather') {
      return handleWeatherRequest(request, env, ctx);
    }

    // For any other /api/* routes, return 404
    return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Common security headers for all responses
const DEFAULT_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
};

/**
 * Helper to determine allowed CORS origin
 * Returns the origin string if allowed, or null if forbidden.
 */
function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return null; // No Origin header, no CORS headers needed (same-origin or non-browser)

  // Whitelist:
  // 1. Production domain
  // 2. Localhost/127.0.0.1 for development
  if (
    origin === 'https://circuit-weather.racing' ||
    /^http:\/\/localhost(:\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
  ) {
    return origin;
  }

  return null;
}

/**
 * Handle F1 API requests with caching
 */
async function handleApiRequest(request, env, ctx) {
  const url = new URL(request.url);
  // Extract path parameters after /api/f1/
  // e.g. /api/f1/current -> current
  const apiPath = url.pathname.replace('/api/f1/', '');

  // Validate apiPath: Strict whitelist + structure check
  // Allows: alphanumeric, dot, hyphen, underscore, slash
  // Rejects: anything else (%, space, <, >, etc.), directory traversal (..), empty segments (//), absolute paths (/)
  const validCharsRegex = /^[a-zA-Z0-9/._-]*$/;

  // SEC: Input length limit to prevent DoS/resource exhaustion
  if (apiPath.length > 255) {
    return new Response(JSON.stringify({ error: 'Path too long' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...DEFAULT_SECURITY_HEADERS
      }
    });
  }

  if (!validCharsRegex.test(apiPath) || apiPath.includes('..') || apiPath.includes('//') || apiPath.startsWith('/')) {
    return new Response(JSON.stringify({ error: 'Invalid API path' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...DEFAULT_SECURITY_HEADERS
      }
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

    // Apply strict CORS
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      headers.set('Access-Control-Allow-Origin', allowedOrigin);
      headers.set('Vary', 'Origin');
    } else {
      headers.delete('Access-Control-Allow-Origin');
    }

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
          // We don't expose CORS on error pages unless necessary?
          // Better to keep it consistent.
          ...(getAllowedOrigin(request) ? { 'Access-Control-Allow-Origin': getAllowedOrigin(request) } : {}),
        },
      });
    }

    const responseBody = await upstreamResponse.text();

    // Create cacheable response (1 hour)
    // We store '*' in cache as a fallback, but we always override on delivery
    response = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*', // Store permissive, override on delivery
        ...DEFAULT_SECURITY_HEADERS
      },
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    // Prepare response for client with strict CORS
    const clientHeaders = new Headers(response.headers);
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      clientHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      clientHeaders.set('Vary', 'Origin');
    } else {
      clientHeaders.delete('Access-Control-Allow-Origin');
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: clientHeaders
    });

  } catch (error) {
    console.error('API Fetch Error:', error); // Log internal details
    return new Response(JSON.stringify({
      error: 'Failed to fetch from upstream',
      // SEC: Do not leak error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...DEFAULT_SECURITY_HEADERS,
        ...(getAllowedOrigin(request) ? { 'Access-Control-Allow-Origin': getAllowedOrigin(request) } : {}),
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
  // SEC: Check length (50 chars max) and format
  if (!trackId || trackId.length > 50 || trackId.includes('..') || trackId.includes('/') || !/^[a-z0-9-]+$/.test(trackId)) {
    return new Response(JSON.stringify({ error: 'Invalid track ID' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...DEFAULT_SECURITY_HEADERS
      }
    });
  }

  const upstreamUrl = `https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/${trackId}.geojson`;

  // Use a canonical cache key based on the upstream URL
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // Check cache match
  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');

    // Apply strict CORS
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      headers.set('Access-Control-Allow-Origin', allowedOrigin);
      headers.set('Vary', 'Origin');
    } else {
      headers.delete('Access-Control-Allow-Origin');
    }

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
          ...(getAllowedOrigin(request) ? { 'Access-Control-Allow-Origin': getAllowedOrigin(request) } : {}),
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
        ...DEFAULT_SECURITY_HEADERS
      },
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    // Prepare response for client with strict CORS
    const clientHeaders = new Headers(response.headers);
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      clientHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      clientHeaders.set('Vary', 'Origin');
    } else {
      clientHeaders.delete('Access-Control-Allow-Origin');
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: clientHeaders
    });

  } catch (error) {
    console.error('Track Fetch Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch track data',
      // SEC: Do not leak error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...(getAllowedOrigin(request) ? { 'Access-Control-Allow-Origin': getAllowedOrigin(request) } : {}),
      }
    });
  }
}

/**
 * Handle Open Meteo Weather API requests with caching
 */
async function handleWeatherRequest(request, env, ctx) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  // SEC: Validate inputs (Strict regex to prevent parameter pollution)
  const validCoordRegex = /^-?\d+(\.\d+)?$/;
  if (!lat || !lon || !validCoordRegex.test(lat) || !validCoordRegex.test(lon)) {
    return new Response(JSON.stringify({ error: 'Invalid latitude or longitude' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...DEFAULT_SECURITY_HEADERS
      }
    });
  }

  // Construct upstream URL with hardcoded fields to prevent abuse
  const upstreamUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation&timeformat=unixtime&forecast_days=16`;

  // Canonical cache key
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // Check cache match
  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');

    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      headers.set('Access-Control-Allow-Origin', allowedOrigin);
      headers.set('Vary', 'Origin');
    } else {
      headers.delete('Access-Control-Allow-Origin');
    }

    // Set client cache control (15 mins)
    headers.set('Cache-Control', 'public, max-age=900');

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
        error: 'Upstream Weather API error',
        status: upstreamResponse.status,
      }), {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...(getAllowedOrigin(request) ? { 'Access-Control-Allow-Origin': getAllowedOrigin(request) } : {}),
        },
      });
    }

    const responseBody = await upstreamResponse.text();

    // Cache for 15 minutes (900 seconds)
    const cacheResponse = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900',
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*',
        ...DEFAULT_SECURITY_HEADERS
      },
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));

    // Prepare client response
    const clientHeaders = new Headers(cacheResponse.headers);
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      clientHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      clientHeaders.set('Vary', 'Origin');
    } else {
      clientHeaders.delete('Access-Control-Allow-Origin');
    }

    return new Response(responseBody, {
        status: 200,
        headers: clientHeaders
    });

  } catch (error) {
    console.error('Weather Fetch Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch weather data',
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...DEFAULT_SECURITY_HEADERS,
        ...(getAllowedOrigin(request) ? { 'Access-Control-Allow-Origin': getAllowedOrigin(request) } : {}),
      }
    });
  }
}

/**
 * Handle RainViewer API requests with caching
 */
async function handleRadarRequest(request, env, ctx) {
  const upstreamUrl = 'https://api.rainviewer.com/public/weather-maps.json';
  // Canonical cache key
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // Check cache match
  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');

    // Apply strict CORS
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      headers.set('Access-Control-Allow-Origin', allowedOrigin);
      headers.set('Vary', 'Origin');
    } else {
      headers.delete('Access-Control-Allow-Origin');
    }

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
          ...(getAllowedOrigin(request) ? { 'Access-Control-Allow-Origin': getAllowedOrigin(request) } : {}),
        },
      });
    }

    const responseBody = await upstreamResponse.text();

    // 1. Prepare Response for Cache (1 minute)
    const cacheResponse = new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // Worker Cache TTL
        'X-Cache': 'MISS',
        'Access-Control-Allow-Origin': '*',
        ...DEFAULT_SECURITY_HEADERS
      },
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));

    // 2. Prepare Response for Client (1 minute)
    const clientHeaders = new Headers(cacheResponse.headers);
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      clientHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      clientHeaders.set('Vary', 'Origin');
    } else {
      clientHeaders.delete('Access-Control-Allow-Origin');
    }
    // Set client cache control
    clientHeaders.set('Cache-Control', 'public, max-age=60');

    return new Response(responseBody, {
        status: 200,
        headers: clientHeaders
    });

  } catch (error) {
    console.error('Radar Fetch Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch radar data',
      // SEC: Do not leak error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...DEFAULT_SECURITY_HEADERS,
        ...(getAllowedOrigin(request) ? { 'Access-Control-Allow-Origin': getAllowedOrigin(request) } : {}),
      }
    });
  }
}
