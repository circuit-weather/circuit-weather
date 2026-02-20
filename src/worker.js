/**
 * Cloudflare Worker with Asset Handling
 * 
 * Handles:
 * 1. API proxy requests to /api/f1/*
 * 
 * Static assets and SPA fallback are handled by Cloudflare's asset configuration
 * via wrangler.toml's run_worker_first and not_found_handling settings.
 */

// Global timeout for all upstream API calls to prevent resource exhaustion
const API_TIMEOUT = 5000;

// Bolt Optimization: Pre-compile regexes for hot-path performance
const VALID_API_PATH_REGEX = /^[a-zA-Z0-9/._-]*$/;
const VALID_COORD_REGEX = /^-?\d+(\.\d+)?$/;
const VALID_TRACK_ID_REGEX = /^[a-z0-9-]+$/;
const PRODUCTION_DOMAIN = 'https://circuit-weather.racing';
const ALLOWED_ORIGIN_LOCALHOST_REGEX = /^http:\/\/localhost(:\d+)?$/;
const ALLOWED_ORIGIN_127_REGEX = /^http:\/\/127\.0\.0\.1(:\d+)?$/;
const ALLOWED_PREVIEW_REGEX = /^https:\/\/.*\.pages\.dev$/;
const ALLOWED_WORKER_REGEX = /^https:\/\/.*\.workers\.dev$/;
const DOTFILE_REGEX = /(?:^|\/)\./;

/**
 * Helper to validate request source (Hotlink Protection)
 * Checks Origin and Referer headers against allowlist.
 * Returns true if allowed, false if blocked.
 */
function checkRequestSource(request) {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');

  // 1. Check Origin (Strict)
  if (origin) {
    if (
      origin !== PRODUCTION_DOMAIN &&
      !ALLOWED_ORIGIN_LOCALHOST_REGEX.test(origin) &&
      !ALLOWED_ORIGIN_127_REGEX.test(origin) &&
      !ALLOWED_PREVIEW_REGEX.test(origin) &&
      !ALLOWED_WORKER_REGEX.test(origin)
    ) {
      return false; // Invalid Origin
    }
  }

  // 2. Check Referer (Strict)
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refOrigin = refererUrl.origin;
      if (
        refOrigin !== PRODUCTION_DOMAIN &&
        !ALLOWED_ORIGIN_LOCALHOST_REGEX.test(refOrigin) &&
        !ALLOWED_ORIGIN_127_REGEX.test(refOrigin) &&
        !ALLOWED_PREVIEW_REGEX.test(refOrigin) &&
        !ALLOWED_WORKER_REGEX.test(refOrigin)
      ) {
        return false; // Invalid Referer
      }
    } catch (e) {
      return false; // Malformed Referer
    }
  }

  return true;
}

const LEAFLET_ASSETS = new Map([
  ['leaflet.js', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    contentTypes: ['application/javascript', 'text/javascript'], // Allow both standard and legacy
    integrity: '20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
  }],
  ['leaflet.css', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    contentTypes: ['text/css'],
    integrity: 'p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
  }],
  ['images/layers.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
    contentTypes: ['image/png'],
    integrity: 'Hbvp0CjikvNvy6j4s6KNXokydU/CIVuaxp5M3s9RB8Y='
  }],
  ['images/layers-2x.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png',
    contentTypes: ['image/png'],
    integrity: 'Bm2sqFDY/77wB68AsG6sABVyje4nnFHzy2xxbffELt8='
  }],
  ['images/marker-icon.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    contentTypes: ['image/png'],
    integrity: 'V0w6XMqF9BFAhbaEFZbWLwDXyJLHsD8oy/owHesdxDc='
  }],
  ['images/marker-icon-2x.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    contentTypes: ['image/png'],
    integrity: 'ABecTB7oMNOhCEEq4NKU9Vd2z+sIXGASmjmqb8SuJSg='
  }],
  ['images/marker-shadow.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    contentTypes: ['image/png'],
    integrity: 'Jk9cZAM58ELdcpBiz8BMF/jqDymIK1OOOEjtjxDttNo='
  }],
]);

const ALLOWED_TILE_HEADERS = ['Content-Type', 'Content-Length', 'Last-Modified', 'ETag', 'Date'];

/**
 * Calculates SHA-256 hash of a buffer and returns it as base64 string
 */
async function calculateHash(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Simple In-Memory Rate Limiter
 * Note: In a serverless environment, this state is ephemeral and per-isolate.
 * It provides a "best effort" defense against rapid-fire DoS attacks on a single instance.
 */
class RateLimiter {
  constructor(limit, windowMs, maxIps = 10000) {
    this.limit = limit; // Capacity
    this.windowMs = windowMs;
    this.rate = limit / windowMs; // Tokens per ms
    this.maxIps = maxIps;
    // Bolt Optimization: Generational Garbage Collection
    // Use two maps to avoid O(N) cleanup iteration
    this.currentGen = new Map();
    this.oldGen = new Map();
    this.lastCleanup = Date.now();
  }

  check(ip) {
    const now = Date.now();

    // Bolt Optimization: Rotate generations every windowMs
    // This provides O(1) cleanup instead of O(N) iteration
    if (now - this.lastCleanup > this.windowMs) {
      this.cleanup(now);
    }

    let record = this.currentGen.get(ip);

    if (record) {
      // Found in current generation
      const elapsed = now - record.lastCheck;
      const refill = elapsed * this.rate;
      record.tokens = Math.min(this.limit, record.tokens + refill);
      record.lastCheck = now;

      // Bolt Optimization: Move to end (LRU)
      // Delete and re-set to update insertion order
      this.currentGen.delete(ip);
      this.currentGen.set(ip, record);

      if (record.tokens >= 1) {
        record.tokens -= 1;
        return true;
      }
      return false;
    }

    // Check old generation
    record = this.oldGen.get(ip);

    if (record) {
      // Found in old generation - migrate to current if still valid
      // Note: records in oldGen are at most 2 * windowMs old, so they might be valid
      if (now - record.lastCheck <= this.windowMs) {
        const elapsed = now - record.lastCheck;
        const refill = elapsed * this.rate;
        record.tokens = Math.min(this.limit, record.tokens + refill);
        record.lastCheck = now;

        // Move to current
        this.currentGen.set(ip, record);
        this.oldGen.delete(ip); // Optional: keep memory lean

        if (record.tokens >= 1) {
          record.tokens -= 1;
          return true;
        }
        return false;
      }
    }

    // New or expired: Create new record
    // SEC: Prevent memory exhaustion DoS
    if (this.currentGen.size >= this.maxIps) {
      // If full, evict oldest entry (LRU) to make room
      // Map.keys().next() is O(1) in V8
      const oldestIp = this.currentGen.keys().next().value;
      this.currentGen.delete(oldestIp);
    }

    // Start with full tokens minus the 1 we are about to consume
    record = { tokens: this.limit - 1, lastCheck: now };
    this.currentGen.set(ip, record);
    return true;
  }

  cleanup(now) {
    // Bolt Optimization: O(1) Generational Cleanup
    // Simply rotate the maps. Old current becomes old (to be checked for migration),
    // and very old data (previous oldGen) is discarded by GC.
    this.oldGen = this.currentGen;
    this.currentGen = new Map();
    this.lastCleanup = now;
  }
}

// 1000 requests per minute per IP per isolate (Increased for tile support)
const limiter = new RateLimiter(1000, 60000);

export default {
  async fetch(request, env, ctx) {
    // SEC: Application Layer Rate Limiting
    const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    if (!limiter.check(clientIp)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          ...getErrorHeaders(request),
          'Retry-After': '60',
        }
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Enforce Method Whitelist
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          ...getErrorHeaders(request),
          'Allow': 'GET, HEAD, OPTIONS',
        }
      });
    }

    // SEC: Strict Origin/Referer Check (Hotlink Protection)
    if (!checkRequestSource(request)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: getErrorHeaders(request)
      });
    }

    // Only /api/f1/* routes reach this worker (configured via run_worker_first)
    if (path.startsWith('/api/f1/')) {
      return handleApiRequest(request, env, ctx);
    }

    // Handle health request
    if (path === '/api/health') {
      return handleHealthRequest(request, env, ctx);
    }

    // Handle radar requests
    if (path === '/api/radar') {
      return handleRadarRequest(request, env, ctx);
    }

    // Handle radar tile requests (Optimized Cache)
    if (path.startsWith('/api/tiles/')) {
      return handleTileRequest(request, env, ctx);
    }

    // Handle track requests
    if (path.startsWith('/api/track/')) {
      return handleTrackRequest(request, env, ctx);
    }

    // Handle Leaflet proxy (Strict CSP)
    if (path.startsWith('/api/assets/')) {
      return handleLeafletRequest(request, env, ctx);
    }

    // For any other /api/* routes, return 404
    return new Response(JSON.stringify({ error: 'API endpoint not found' }), {
      status: 404,
      headers: getErrorHeaders(request)
    });
  }
};

// Common security headers for all responses
const DEFAULT_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '0', // Disable XSS Auditor to prevent XS-Search/Info Leakage
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Permissions-Policy': 'accelerometer=(), autoplay=(), camera=(), fullscreen=(), geolocation=(), gyroscope=(), interest-cohort=(), magnetometer=(), microphone=(), payment=(), picture-in-picture=(), usb=(), sync-xhr=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "upgrade-insecure-requests; default-src 'none'; frame-ancestors 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';",
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Robots-Tag': 'noindex', // Prevent search engines from indexing API responses
};

// Helper to generate standard error headers (Security + CORS + No-Cache)
function getErrorHeaders(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...DEFAULT_SECURITY_HEADERS,
  };

  const allowedOrigin = getAllowedOrigin(request);
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Vary'] = 'Origin';
  }

  return headers;
}

// Helper to handle CORS preflight requests
function handleOptions(request) {
  const headers = {
    ...DEFAULT_SECURITY_HEADERS,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', // Standard
    'Access-Control-Max-Age': '86400',
  };

  const allowedOrigin = getAllowedOrigin(request);
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Vary'] = 'Origin';
  }

  return new Response(null, {
    status: 204,
    headers
  });
}

// Helper to generate a generic, empty-like response to prevent frontend errors
function getEmptyRadarResponse(request) {
  const emptyRadar = {
    radar: {
      past: [],
      nowcast: []
    },
    host: 'https://tilecache.rainviewer.com'
  };
  return new Response(JSON.stringify(emptyRadar), {
    status: 200,
    headers: getErrorHeaders(request)
  });
}

/**
 * Helper to cache and return an error response
 */
function cacheAndReturnError(request, cache, cacheKey, status, errorData, ctx) {
  // Cache error response to prevent hammering upstream
  const errorCacheTTL = status === 429 ? 300 : 60;

  const errorBody = JSON.stringify(errorData);

  const errorHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${errorCacheTTL}`,
    'X-Cache': 'ERROR-CACHED',
    'X-Upstream-Status': status.toString(),
    'Access-Control-Allow-Origin': '*', // Store permissive, override on delivery
    ...DEFAULT_SECURITY_HEADERS
  });

  const errorResponse = new Response(errorBody, {
    status: status,
    headers: errorHeaders
  });

  // Cache the error response
  ctx.waitUntil(cache.put(cacheKey, errorResponse.clone()));

  // Prepare response for client with strict CORS
  const clientErrorHeaders = new Headers(errorHeaders);
  const allowedOrigin = getAllowedOrigin(request);
  if (allowedOrigin) {
    clientErrorHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
    clientErrorHeaders.set('Vary', 'Origin');
  } else {
    clientErrorHeaders.delete('Access-Control-Allow-Origin');
  }

  return new Response(errorBody, {
    status: status,
    headers: clientErrorHeaders
  });
}

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
    origin === PRODUCTION_DOMAIN ||
    ALLOWED_ORIGIN_LOCALHOST_REGEX.test(origin) ||
    ALLOWED_ORIGIN_127_REGEX.test(origin) ||
    ALLOWED_PREVIEW_REGEX.test(origin) ||
    ALLOWED_WORKER_REGEX.test(origin)
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

  // SEC: Input length limit to prevent DoS/resource exhaustion
  if (apiPath.length > 255) {
    return new Response(JSON.stringify({ error: 'Path too long' }), {
      status: 400,
      headers: getErrorHeaders(request)
    });
  }

  // SEC: Prevent access to hidden files/directories (dotfiles)
  // Bolt Optimization: Use regex instead of split/some for performance
  const hasDotfiles = DOTFILE_REGEX.test(apiPath);

  if (!VALID_API_PATH_REGEX.test(apiPath) || apiPath.includes('..') || apiPath.includes('//') || apiPath.startsWith('/') || hasDotfiles) {
    return new Response(JSON.stringify({ error: 'Invalid API path' }), {
      status: 400,
      headers: getErrorHeaders(request)
    });
  }

  // Build upstream URL
  const upstreamUrl = `https://api.jolpi.ca/ergast/f1/${apiPath}`;

  // Cache key based on the full upstream URL
  // SEC: Normalize cache key to URL only to prevent cache busting via headers
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

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  // Fetch from upstream
  const emptyResponse = () => {
    const errorResponse = {
      error: 'Failed to fetch weather data',
      current: {
        temperature_2m: null,
        relative_humidity_2m: null,
        wind_speed_10m: null,
      },
      hourly: {
        time: [],
        temperature_2m: [],
        precipitation_probability: []
      },
      current_units: {}
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 502,
      headers: getErrorHeaders(request)
    });
  };

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CircuitWeather/1.0',
      },
      signal: AbortSignal.timeout(API_TIMEOUT),
    });

    const status = upstreamResponse.status;

    if (!upstreamResponse.ok) {
      return cacheAndReturnError(request, cache, cacheKey, status, {
        error: 'Upstream API error',
        status: status,
      }, ctx);
    }

    // SEC: Strict Content-Type Validation
    // Prevent cache poisoning if upstream returns HTML error page with 200 OK
    const contentType = upstreamResponse.headers.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error(`Upstream Invalid Content-Type: ${contentType}`);
      return cacheAndReturnError(request, cache, cacheKey, 502, {
        error: 'Invalid upstream content type',
      }, ctx);
    }

    // Bolt Optimization: Stream response instead of buffering text
    const [cacheBody, clientBody] = upstreamResponse.body.tee();

    // Create cacheable response (1 hour)
    // We store '*' in cache as a fallback, but we always override on delivery
    const cacheHeaders = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'X-Cache': 'MISS',
      'X-Upstream-Status': status.toString(),
      'Access-Control-Allow-Origin': '*', // Store permissive, override on delivery
      ...DEFAULT_SECURITY_HEADERS
    });

    const cacheResponse = new Response(cacheBody, {
      status: 200,
      headers: cacheHeaders,
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));

    // Prepare response for client with strict CORS
    const clientHeaders = new Headers(cacheHeaders);
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      clientHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      clientHeaders.set('Vary', 'Origin');
    } else {
      clientHeaders.delete('Access-Control-Allow-Origin');
    }

    return new Response(clientBody, {
      status: 200,
      headers: clientHeaders
    });

  } catch (error) {
    console.error('API Fetch Error:', error); // Log internal details
    return new Response(JSON.stringify({
      error: 'Failed to fetch from upstream',
      // SEC: Do not leak error.message
    }), {
      status: 502,
      headers: getErrorHeaders(request)
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
  // Bolt Optimization: Remove redundant string scans (includes) covered by regex
  if (!trackId || trackId.length > 50 || !VALID_TRACK_ID_REGEX.test(trackId)) {
    return new Response(JSON.stringify({ error: 'Invalid track ID' }), {
      status: 400,
      headers: getErrorHeaders(request)
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
      signal: AbortSignal.timeout(API_TIMEOUT),
    });

    const upstreamStatus = upstreamResponse.status;

    if (!upstreamResponse.ok) {
      const status = upstreamStatus === 404 ? 404 : 502;
      return cacheAndReturnError(request, cache, cacheKey, status, {
        error: 'Track not found',
        status: upstreamStatus,
      }, ctx);
    }

    // Bolt Optimization: Stream response instead of buffering text
    const [cacheBody, clientBody] = upstreamResponse.body.tee();

    // Create cacheable response (24 hours - tracks are static)
    const cacheHeaders = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
      'X-Cache': 'MISS',
      'X-Upstream-Status': upstreamStatus.toString(),
      'Access-Control-Allow-Origin': '*',
      ...DEFAULT_SECURITY_HEADERS
    });

    const cacheResponse = new Response(cacheBody, {
      status: 200,
      headers: cacheHeaders,
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));

    // Prepare response for client with strict CORS
    const clientHeaders = new Headers(cacheHeaders);
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      clientHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      clientHeaders.set('Vary', 'Origin');
    } else {
      clientHeaders.delete('Access-Control-Allow-Origin');
    }

    return new Response(clientBody, {
      status: 200,
      headers: clientHeaders
    });

  } catch (error) {
    console.error('Track Fetch Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch track data',
      // SEC: Do not leak error.message
    }), {
      status: 502,
      headers: getErrorHeaders(request)
    });
  }
}

/**
 * Handle Leaflet Assets proxy to enable strict CSP (remove unpkg.com)
 * Proxies JS, CSS, and images from unpkg
 */
async function handleLeafletRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/assets/', '');

  const config = LEAFLET_ASSETS.get(path);
  if (!config) {
    return new Response('File not found', { status: 404, headers: getErrorHeaders(request) });
  }

  const upstreamUrl = config.upstream;
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

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
      headers
    });
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'CircuitWeather/1.0' },
      signal: AbortSignal.timeout(API_TIMEOUT),
    });

    const status = upstreamResponse.status;
    if (!upstreamResponse.ok) {
      console.error(`Leaflet Fetch Error (${path}): ${status}`);
      const errorHeaders = getErrorHeaders(request);
      errorHeaders['X-Upstream-Status'] = status.toString();
      return new Response('Failed to load Leaflet asset', { status: 502, headers: errorHeaders });
    }

    // SEC: Validate Content-Type
    const contentType = upstreamResponse.headers.get('Content-Type');
    // Allow partial match (e.g. text/css; charset=utf-8) against any allowed type
    const isValidType = config.contentTypes.some(type => contentType && contentType.includes(type));

    if (!isValidType) {
      console.error(`Leaflet Invalid Content-Type (${path}): ${contentType} (expected ${config.contentTypes.join(' or ')})`);
      return new Response('Invalid upstream content type', { status: 502, headers: getErrorHeaders(request) });
    }

    // SEC: Buffer response for SRI Verification
    const buffer = await upstreamResponse.arrayBuffer();

    // Verify Hash
    if (config.integrity) {
      const hash = await calculateHash(buffer);
      if (hash !== config.integrity) {
        console.error(`SRI Mismatch for ${path}: expected ${config.integrity}, got ${hash}`);
        const errorHeaders = getErrorHeaders(request);
        errorHeaders['X-SRI-Status'] = 'mismatch';
        return new Response('SRI Integrity Check Failed', { status: 502, headers: errorHeaders });
      }
    }

    // Use the first allowed content type as the canonical one for the client response
    const canonicalType = config.contentTypes[0];

    const cacheHeaders = new Headers({
      'Content-Type': canonicalType, // Enforce strict/canonical type
      'Cache-Control': 'public, max-age=31536000, immutable', // Long cache for versioned file
      'X-Cache': 'MISS',
      'X-Upstream-Status': status.toString(),
      ...DEFAULT_SECURITY_HEADERS
    });

    // Cache it (Clone the response from buffer)
    ctx.waitUntil(cache.put(cacheKey, new Response(buffer, { headers: cacheHeaders })));

    const clientHeaders = new Headers(cacheHeaders);
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      clientHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      clientHeaders.set('Vary', 'Origin');
    }

    // Return to client (from buffer)
    return new Response(buffer, {
      status: 200,
      headers: clientHeaders
    });

  } catch (error) {
    console.error('Leaflet Proxy Error:', error);
    return new Response('Leaflet fetch failed', { status: 502, headers: getErrorHeaders(request) });
  }
}

/**
 * Handle Health Check request
 * Checks connectivity to key upstream APIs and returns basic system status.
 */
async function handleHealthRequest(request, env, ctx) {
  const upstreams = {
    jolpica: 'https://api.jolpi.ca/ergast/f1/current.json',
    rainviewer: 'https://api.rainviewer.com/public/weather-maps.json',
    github: 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/au-1953.geojson'
  };

  const results = {};
  const checks = Object.entries(upstreams).map(async ([name, url]) => {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'CircuitWeather-Health/1.0' },
        signal: AbortSignal.timeout(2000)
      });
      results[name] = res.status;
    } catch (e) {
      results[name] = 'unreachable';
    }
  });

  await Promise.all(checks);

  return new Response(JSON.stringify({
    status: 'ok',
    version: '1.1.0',
    upstreams: results,
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || 'production'
  }), {
    status: 200,
    headers: getErrorHeaders(request)
  });
}

/**
 * Handle Radar Tile requests with robust caching
 * Route: /api/tiles/...
 */
async function handleTileRequest(request, env, ctx) {
  const url = new URL(request.url);
  // Extract path suffix: /api/tiles/v2/radar/... -> /v2/radar/...
  const tilePath = url.pathname.replace('/api/tiles', '');

  // SEC: Validate tilePath (length and content) to prevent traversal/SSRF
  // SEC: Prevent access to hidden files/directories (dotfiles)
  // Bolt Optimization: Use regex instead of split/some for performance
  const hasDotfiles = DOTFILE_REGEX.test(tilePath);

  if (tilePath.length > 255 || !VALID_API_PATH_REGEX.test(tilePath) || tilePath.includes('..') || tilePath.includes('//') || hasDotfiles) {
    return new Response(JSON.stringify({ error: 'Invalid tile path' }), {
      status: 400,
      headers: getErrorHeaders(request)
    });
  }

  // SEC: Strict Extension Validation
  // Ensure we only proxy PNG images as expected by the frontend
  if (!tilePath.endsWith('.png')) {
    return new Response(JSON.stringify({ error: 'Invalid tile format' }), {
      status: 400,
      headers: getErrorHeaders(request)
    });
  }

  const upstreamUrl = `https://tilecache.rainviewer.com${tilePath}`;

  // Canonical cache key
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // 1. Check Cache
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

  // 2. Fetch Upstream
  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'CircuitWeather/1.0',
        'Accept': 'image/png,image/*;q=0.8'
      },
      signal: AbortSignal.timeout(API_TIMEOUT),
    });

    const status = upstreamResponse.status;

    // Log outcomes (sampled for 2xx, 100% for errors)
    // Bolt Optimization: Use fast bucket calculation
    const bucket = Math.floor(status / 100);
    if (bucket >= 4 || Math.random() < 0.05) {
      console.log(`Tile Proxy Bucket: ${bucket}xx (Status: ${status}) Path: ${tilePath}`);
    }

    // 3. Cache Determination
    // Cache success (2xx) or benign error (404). Do NOT cache 429/5xx.
    const shouldCache = upstreamResponse.ok || status === 404;
    const ttl = upstreamResponse.ok ? 7200 : 60;

    if (shouldCache) {
      // SEC: Strict Content-Type Validation (ONLY for success responses)
      // Prevent XSS via MIME sniffing if upstream returns non-image content (e.g. HTML)
      // Only allow PNG as we enforced .png extension in URL. Blocks image/svg+xml.
      if (upstreamResponse.ok) {
        const contentType = upstreamResponse.headers.get('Content-Type');
        if (!contentType || !contentType.startsWith('image/png')) {
          console.error(`Upstream Tile Invalid Content-Type: ${contentType}`);
          return new Response(JSON.stringify({ error: 'Invalid upstream content type' }), {
            status: 502,
            headers: getErrorHeaders(request)
          });
        }
      }

      // 4. Cache Response
      const [cacheBody, clientBody] = upstreamResponse.body.tee();

      // SEC: Allowlist headers to prevent leaking sensitive upstream headers
      const cacheHeaders = new Headers();
      for (const header of ALLOWED_TILE_HEADERS) {
        const value = upstreamResponse.headers.get(header);
        if (value) cacheHeaders.set(header, value);
      }

      cacheHeaders.set('Cache-Control', `public, max-age=${ttl}`);
      cacheHeaders.set('X-Cache', 'MISS');
      cacheHeaders.set('X-Upstream-Status', status.toString());
      cacheHeaders.set('Access-Control-Allow-Origin', '*');

      // SEC: Add security headers
      // Ensures X-Content-Type-Options: nosniff is set on cached tiles
      Object.entries(DEFAULT_SECURITY_HEADERS).forEach(([key, value]) => {
        cacheHeaders.set(key, value);
      });

      const cacheResponse = new Response(cacheBody, {
        status: status,
        headers: cacheHeaders
      });

      ctx.waitUntil(cache.put(cacheKey, cacheResponse));

      // 5. Return to Client
      const clientHeaders = new Headers(cacheHeaders);
      const allowedOrigin = getAllowedOrigin(request);
      if (allowedOrigin) {
        clientHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
        clientHeaders.set('Vary', 'Origin');
      } else {
        clientHeaders.delete('Access-Control-Allow-Origin');
      }

      return new Response(clientBody, {
        status: status,
        headers: clientHeaders
      });
    }

    // 6. Non-cacheable Error Handling (429, 5xx, etc)
    const errorHeaders = getErrorHeaders(request);
    errorHeaders['X-Upstream-Status'] = status.toString();

    return new Response(upstreamResponse.body, {
      status: status,
      headers: errorHeaders
    });

  } catch (error) {
    console.error('Tile Proxy Error:', error);
    // Return error to client, frontend will handle retries
    return new Response('Tile proxy failed', {
      status: 502,
      headers: getErrorHeaders(request)
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
      signal: AbortSignal.timeout(API_TIMEOUT),
    });

    const status = upstreamResponse.status;

    if (!upstreamResponse.ok) {
      console.error(`Upstream Radar API Error: Status ${status}`);
      if (status === 429) {
        return new Response(JSON.stringify({ error: 'Upstream Rate Limit' }), {
          status: 429,
          headers: {
            ...getErrorHeaders(request),
            'X-Upstream-Status': '429',
            'Retry-After': '60'
          }
        });
      }
      const emptyResponse = getEmptyRadarResponse(request);
      emptyResponse.headers.set('X-Upstream-Status', status.toString());
      return emptyResponse;
    }

    // SEC: Strict Content-Type Validation
    // Prevent cache poisoning if upstream returns HTML error page (e.g. WAF/Maintenance) with 200 OK
    const contentType = upstreamResponse.headers.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error(`Upstream Radar Invalid Content-Type: ${contentType}`);
      return getEmptyRadarResponse(request);
    }

    // Bolt Optimization: Stream response instead of buffering text
    const [cacheBody, clientBody] = upstreamResponse.body.tee();

    // 1. Prepare Response for Cache (1 minute)
    const cacheHeaders = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60', // Worker Cache TTL
      'X-Cache': 'MISS',
      'X-Upstream-Status': status.toString(),
      'Access-Control-Allow-Origin': '*',
      ...DEFAULT_SECURITY_HEADERS
    });

    const cacheResponse = new Response(cacheBody, {
      status: 200,
      headers: cacheHeaders,
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));

    // 2. Prepare Response for Client (1 minute)
    const clientHeaders = new Headers(cacheHeaders);
    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
      clientHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
      clientHeaders.set('Vary', 'Origin');
    } else {
      clientHeaders.delete('Access-Control-Allow-Origin');
    }
    // Set client cache control
    clientHeaders.set('Cache-Control', 'public, max-age=60');

    return new Response(clientBody, {
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
      headers: getErrorHeaders(request)
    });
  }
}
