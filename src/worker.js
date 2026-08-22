/**
 * Cloudflare Worker with Asset Handling
 * 
 * Handles API proxy requests to:
 * - /api/f1/*
 * - /api/health
 * - /api/radar
 * - /api/tiles/*
 * - /api/track/*
 * - /api/assets/*
 * - /api/config
 * 
 * Static assets and SPA fallback are handled by Cloudflare's asset configuration
 * via wrangler.toml's run_worker_first and not_found_handling settings.
 */

import {
  VALID_API_PATH_REGEX,
  VALID_TRACK_ID_REGEX,
  DOTFILE_REGEX,
  recursivelyDecodePath,
  checkRequestSource,
  checkFetchDest,
  calculateHash,
  RateLimiter,
  API_SECURITY_HEADERS,
  API_SECURITY_HEADERS_ENTRIES,
  getAllowedOrigin,
  setCorsHeaders,
  getEmptyRadarResponse,
  createErrorResponse
} from './worker-utils.js';

// Per-upstream timeouts to prevent resource exhaustion while allowing for slow upstreams
const TIMEOUT_API_F1 = 5000;
const TIMEOUT_API_RADAR = 8000;
const TIMEOUT_API_TILES = 5000;
const TIMEOUT_API_TRACKS = 10000;
const TIMEOUT_API_ASSETS = 10000;

const VENDOR_ASSETS = new Map([
  // Leaflet Assets
  ['leaflet.js', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    contentTypes: ['application/javascript', 'text/javascript'], // Allow both standard and legacy
    integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
  }],
  ['leaflet.css', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    contentTypes: ['text/css'],
    integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
  }],
  ['images/layers.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-Hbvp0CjikvNvy6j4s6KNXokydU/CIVuaxp5M3s9RB8Y='
  }],
  ['images/layers-2x.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-Bm2sqFDY/77wB68AsG6sABVyje4nnFHzy2xxbffELt8='
  }],
  ['images/marker-icon.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-V0w6XMqF9BFAhbaEFZbWLwDXyJLHsD8oy/owHesdxDc='
  }],
  ['images/marker-icon-2x.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-ABecTB7oMNOhCEEq4NKU9Vd2z+sIXGASmjmqb8SuJSg='
  }],
  ['images/marker-shadow.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-Jk9cZAM58ELdcpBiz8BMF/jqDymIK1OOOEjtjxDttNo='
  }],

  // Mapbox GL JS Assets
  // NOTE: We only proxy and cache the software libraries (JS/CSS) here for strict CSP compliance.
  // This is completely acceptable under Mapbox's Terms of Service. Mapbox's strict anti-caching ToS
  // only applies to "Licensed Map Content" (tiles, styles, geocoding API responses), which our app
  // fetches directly client-side, bypassing this worker.
  // Because these static files are heavily cached by Cloudflare, it will cause `api.mapbox.com` to show
  // a very high cache rate in Cloudflare analytics. This is expected and is NOT a ToS violation.
  ['mapbox-gl.js', {
    upstream: 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js',
    contentTypes: ['application/javascript', 'text/javascript'],
    integrity: 'sha256-XievuhzYVFGutWsnId8IFgRDPUifg9ukMeHybMz1zGA='
  }],
  ['mapbox-gl.css', {
    upstream: 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css',
    contentTypes: ['text/css'],
    integrity: 'sha256-zy0HsKcYGtHYBDlDLGruL8UAMxlizCfK+kpn6NAOf+8='
  }]
]);

const ALLOWED_TILE_HEADERS = ['Content-Type', 'Content-Length', 'Last-Modified', 'ETag', 'Date'];

// 1000 requests per minute per IP per isolate (Increased for tile support)
const limiter = new RateLimiter(1000, 60000);

export default {
  async fetch(request, env, ctx) {
    // SEC: Application Layer Rate Limiting
    const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    if (!limiter.check(clientIp)) {
      // Error responses are standardized using the createErrorResponse factory function.
      // This ensures a consistent JSON structure with standardized fields (error, message, status, etc.)
      // across all API endpoints, allowing the frontend to implement unified error handling predictably.
      return createErrorResponse(request, 429, 'Too many requests', {
        'Retry-After': '60',
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
      return createErrorResponse(request, 405, 'Method not allowed', {
        'Allow': 'GET, HEAD, OPTIONS',
      });
    }

    // SEC: Strict Origin/Referer Check (Hotlink Protection)
    if (!checkRequestSource(request, url)) {
      return createErrorResponse(request, 403, 'Forbidden');
    }

    // Only /api/* routes reach this worker (configured via run_worker_first)
    // NOTE: Only the F1 prefix is proxied. The upstream (Jolpica/Ergast) is
    // F1-only, so there is no /api/f2/ or /api/f3/ to add here — those segments
    // would resolve to the same F1 dataset upstream. See the detailed write-up
    // in public/src/CircuitWeatherApp.js handleRoute() before attempting F2/F3.
    if (path.startsWith('/api/f1/')) {
      return handleApiRequest(request, env, ctx, url);
    }

    // Handle health request
    if (path === '/api/health') {
      return handleHealthRequest(request, env, ctx, url);
    }

    // Handle radar requests
    if (path === '/api/radar') {
      return handleRadarRequest(request, env, ctx);
    }

    // Handle radar tile requests (Optimized Cache)
    if (path.startsWith('/api/tiles/')) {
      return handleTileRequest(request, env, ctx, url);
    }

    // Handle track requests
    if (path.startsWith('/api/track/')) {
      return handleTrackRequest(request, env, ctx, url);
    }

    // Handle Vendor proxy (Leaflet & Mapbox) (Strict CSP & AdBlock Bypass)
    if (path.startsWith('/api/assets/')) {
      return handleAssetRequest(request, env, ctx, url);
    }

    // Handle map config request (Securely injects Mapbox token)
    if (path === '/api/config') {
      return handleConfigRequest(request, env);
    }

    // For any other /api/* routes, return 404
    return createErrorResponse(request, 404, 'API endpoint not found');
  }
};

// Helper to handle CORS preflight requests
function handleOptions(request) {
  const headers = {
    ...API_SECURITY_HEADERS,
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

/**
 * Helper to cache and return an error response
 */
function cacheAndReturnError({ request, cache, cacheKey, status, message, extraDetails = {}, ctx }) {
  // Cache error response to prevent hammering upstream
  const errorCacheTTL = status === 429 ? 300 : 60;

  const errorBody = JSON.stringify({
    error: {
      message: message,
      status: status,
      ...extraDetails
    }
  });

  const errorHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${errorCacheTTL}`,
    'X-Cache': 'ERROR-CACHED',
    'X-Upstream-Status': status.toString(),
    'Access-Control-Allow-Origin': '*', // Store permissive, override on delivery
    ...API_SECURITY_HEADERS
  });

  const errorResponse = new Response(errorBody, {
    status: status,
    headers: errorHeaders
  });

  // Cache the error response
  ctx.waitUntil(cache.put(cacheKey, errorResponse.clone()));

  // Prepare response for client with strict CORS
  const clientErrorHeaders = new Headers(errorHeaders);
  setCorsHeaders(clientErrorHeaders, request);

  return new Response(errorBody, {
    status: status,
    headers: clientErrorHeaders
  });
}

/**
 * Handle Config Request
 * Securely returns public tokens (like Mapbox) to the frontend without exposing them in source code.
 */
function handleConfigRequest(request, env) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

  const configBody = JSON.stringify({
    mapboxToken: env.MAPBOX_ACCESS_TOKEN || ''
  });

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400', // Cache config for 24h
    ...API_SECURITY_HEADERS
  });

  setCorsHeaders(headers, request);

  return new Response(configBody, {
    status: 200,
    headers
  });
}

/**
 * Handle F1 API requests with caching
 */
async function handleApiRequest(request, env, ctx, url) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }


  // Extract path parameters after /api/f1/
  // e.g. /api/f1/current -> current
  let apiPath = url.pathname.slice('/api/f1/'.length);

  // SEC: Recursively decode path to prevent multiple-encoding bypasses
  apiPath = recursivelyDecodePath(apiPath);
  if (apiPath === null) {
    return createErrorResponse(request, 400, 'Invalid API path encoding');
  }

  // Validate apiPath: Strict whitelist + structure check
  // Allows: alphanumeric, dot, hyphen, underscore, slash
  // Rejects: anything else (%, space, <, >, etc.), directory traversal (..), empty segments (//), absolute paths (/)

  // SEC: Input length limit to prevent DoS/resource exhaustion
  if (apiPath.length > 255) {
    return createErrorResponse(request, 400, 'Path too long');
  }

  // SEC: Prevent access to hidden files/directories (dotfiles)
  // Bolt Optimization: Use regex instead of split/some for performance
  const hasDotfiles = DOTFILE_REGEX.test(apiPath);

  if (!VALID_API_PATH_REGEX.test(apiPath) || apiPath.includes('..') || apiPath.includes('//') || apiPath.startsWith('/') || hasDotfiles) {
    return createErrorResponse(request, 400, 'Invalid API path');
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
    setCorsHeaders(headers, request);

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
      signal: AbortSignal.timeout(TIMEOUT_API_F1),
    });

    const status = upstreamResponse.status;

    if (!upstreamResponse.ok) {
      return cacheAndReturnError({ request, cache, cacheKey, status, message: 'Upstream API error', ctx });
    }

    // SEC: Strict Content-Type Validation
    // Prevent cache poisoning if upstream returns HTML error page with 200 OK
    // Bolt Security: Use strict MIME comparison, not substring check
    const contentType = upstreamResponse.headers.get('Content-Type');
    const mime = contentType ? contentType.split(';')[0].trim().toLowerCase() : '';

    if (mime !== 'application/json') {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Invalid Content-Type: ${contentType} (parsed: ${mime})`);
      }
      return cacheAndReturnError({ request, cache, cacheKey, status: 502, message: 'Invalid upstream content type', ctx });
    }

    // Bolt Optimization: Stream response instead of buffering text
    const [cacheBody, clientBody] = upstreamResponse.body.tee();

    // Create cacheable response (24 hours)
    // We store '*' in cache as a fallback, but we always override on delivery
    const cacheHeaders = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
      'X-Cache': 'MISS',
      'X-Upstream-Status': status.toString(),
      'Access-Control-Allow-Origin': '*', // Store permissive, override on delivery
      ...API_SECURITY_HEADERS
    });

    const cacheResponse = new Response(cacheBody, {
      status: 200,
      headers: cacheHeaders,
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));

    // Prepare response for client with strict CORS
    const clientHeaders = new Headers(cacheHeaders);
    setCorsHeaders(clientHeaders, request);

    return new Response(clientBody, {
      status: 200,
      headers: clientHeaders
    });

  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('API Fetch Error:', error); // Log internal details
    }
    return createErrorResponse(request, 502, 'Failed to fetch from upstream');
  }
}

/**
 * Handle Track GeoJSON requests with caching
 */
async function handleTrackRequest(request, env, ctx, url) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }


  // Extract geoJsonId from /api/track/:id
  const trackId = url.pathname.slice('/api/track/'.length);

  // Validation
  // SEC: Check length (50 chars max) and format
  // Bolt Optimization: Remove redundant string scans (includes) covered by regex
  if (!trackId || trackId.length > 50 || !VALID_TRACK_ID_REGEX.test(trackId)) {
    return createErrorResponse(request, 400, 'Invalid track ID');
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
    setCorsHeaders(headers, request);

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
      signal: AbortSignal.timeout(TIMEOUT_API_TRACKS),
    });

    const upstreamStatus = upstreamResponse.status;

    if (!upstreamResponse.ok) {
      const status = upstreamStatus === 404 ? 404 : 502;
      return cacheAndReturnError({ request, cache, cacheKey, status, message: 'Track not found', ctx });
    }

    // SEC: Strict Content-Type Validation
    // Prevent MIME sniffing vulnerabilities if upstream serves non-JSON content
    const contentType = upstreamResponse.headers.get('Content-Type');
    const mime = contentType ? contentType.split(';')[0].trim().toLowerCase() : '';

    // GitHub raw content for geojson might be text/plain or application/json
    // We should strictly allow text/plain or application/json since github raw serves text/plain
    if (mime !== 'application/json' && mime !== 'text/plain') {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Track Invalid Content-Type: ${contentType} (parsed: ${mime})`);
      }
      return cacheAndReturnError({ request, cache, cacheKey, status: 502, message: 'Invalid upstream content type', ctx });
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
      ...API_SECURITY_HEADERS
    });

    const cacheResponse = new Response(cacheBody, {
      status: 200,
      headers: cacheHeaders,
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));

    // Prepare response for client with strict CORS
    const clientHeaders = new Headers(cacheHeaders);
    setCorsHeaders(clientHeaders, request);

    return new Response(clientBody, {
      status: 200,
      headers: clientHeaders
    });

  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('Track Fetch Error:', error);
    }
    return createErrorResponse(request, 502, 'Failed to fetch track data');
  }
}

/**
 * Handle Vendor Assets proxy to enable strict CSP and bypass tracking blockers
 * Proxies JS, CSS, and images from unpkg and Mapbox CDNs
 */
async function handleAssetRequest(request, env, ctx, url) {

  const path = url.pathname.slice('/api/assets/'.length);

  const config = VENDOR_ASSETS.get(path);
  if (!config) {
    return createErrorResponse(request, 404, 'File not found');
  }

  const upstreamUrl = config.upstream;
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');

    // Apply strict CORS
    setCorsHeaders(headers, request);

    return new Response(response.body, {
      status: response.status,
      headers
    });
  }

  return await fetchAndCacheVendorAsset(request, env, ctx, path, config, cache, cacheKey);
}

/**
 * Helper to fetch, validate, and cache vendor assets
 */
async function fetchAndCacheVendorAsset(request, env, ctx, path, config, cache, cacheKey) {
  const upstreamUrl = config.upstream;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'CircuitWeather/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_API_ASSETS),
    });

    const status = upstreamResponse.status;
    if (!upstreamResponse.ok) {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Vendor Asset Fetch Error (${path}): ${status}`);
      }
      return createErrorResponse(request, 502, 'Failed to load vendor asset', {
        'X-Upstream-Status': status.toString()
      });
    }

    // SEC: Validate Content-Type
    // Bolt Security: Use strict MIME comparison, not substring check
    const contentType = upstreamResponse.headers.get('Content-Type');
    const mime = contentType ? contentType.split(';')[0].trim().toLowerCase() : '';
    const isValidType = config.contentTypes.includes(mime);

    if (!isValidType) {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Vendor Asset Invalid Content-Type (${path}): ${contentType} (expected ${config.contentTypes.join(' or ')})`);
      }
      return createErrorResponse(request, 502, 'Invalid upstream content type');
    }

    // SEC: Buffer response for SRI Verification
    const buffer = await upstreamResponse.arrayBuffer();

    // Verify Hash
    if (config.integrity) {
      const hash = await calculateHash(buffer);
      if (hash !== config.integrity) {
        if (env.ENVIRONMENT !== 'production') {
          console.error(`SRI Mismatch for ${path}: expected ${config.integrity}, got ${hash}`);
        }
        return createErrorResponse(request, 502, 'SRI Integrity Check Failed', {
          'X-SRI-Status': 'mismatch'
        });
      }
    }

    // Use the first allowed content type as the canonical one for the client response
    const canonicalType = config.contentTypes[0];

    const cacheHeaders = new Headers({
      'Content-Type': canonicalType, // Enforce strict/canonical type
      'Cache-Control': 'public, max-age=31536000, immutable', // Long cache for versioned file
      'X-Cache': 'MISS',
      'X-Upstream-Status': status.toString(),
      ...API_SECURITY_HEADERS
    });

    // Cache it (Clone the response from buffer)
    ctx.waitUntil(cache.put(cacheKey, new Response(buffer, { headers: cacheHeaders })));

    const clientHeaders = new Headers(cacheHeaders);
    setCorsHeaders(clientHeaders, request);

    // Return to client (from buffer)
    return new Response(buffer, {
      status: 200,
      headers: clientHeaders
    });

  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('Vendor Asset Proxy Error:', error);
    }
    return createErrorResponse(request, 502, 'Vendor asset fetch failed');
  }
}

/**
 * Handle Health Check request
 * Checks connectivity to key upstream APIs and returns basic system status.
 */
async function handleHealthRequest(request, env, ctx, url) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

  // Caching Strategy: Cache the health check for 60 seconds
  // Prevents abuse of the health endpoint as a DDOS vector against upstreams

  const cacheKey = new Request(url.origin + url.pathname);
  const cache = caches.default;

  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');

    // Apply strict CORS
    setCorsHeaders(headers, request);

    return new Response(response.body, {
      status: response.status,
      headers
    });
  }

  const upstreams = {
    jolpica: 'https://api.jolpi.ca/ergast/f1/current.json',
    rainviewer: 'https://api.rainviewer.com/public/weather-maps.json',
    github: 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/au-1953.geojson'
  };

  const results = {};
  const checks = Object.keys(upstreams).map((name) => {
    const url = upstreams[name];
    return fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'CircuitWeather-Health/1.0' },
      signal: AbortSignal.timeout(2000)
    })
      .then((res) => {
        results[name] = res.status;
      })
      .catch((e) => {
        if (env.ENVIRONMENT !== 'production') {
          console.error(`Health check failed for ${name}:`, e);
        }
        results[name] = 'unreachable';
      });
  });

  await Promise.all(checks);

  // Create cacheable response
  const body = JSON.stringify({
    status: 'ok',
    version: '1.1.1',
    upstreams: results,
    timestamp: new Date().toISOString()
  });

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60', // Cache for 60s
    'X-Cache': 'MISS',
    ...API_SECURITY_HEADERS
  });

  const newResponse = new Response(body, {
    status: 200,
    headers: headers
  });

  // Save to cache
  ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));

  // Return to client (strict CORS)
  const clientHeaders = new Headers(headers);
  setCorsHeaders(clientHeaders, request);

  return new Response(body, {
    status: 200,
    headers: clientHeaders
  });
}

/**
 * Validates the tile path for security and format.
 * Returns an error Response if invalid, or a valid decoded path string.
 */
function validateTilePath(request, tilePath) {
  // SEC: Recursively decode path to prevent multiple-encoding bypasses
  let decodedPath = recursivelyDecodePath(tilePath);
  if (decodedPath === null) {
    return createErrorResponse(request, 400, 'Invalid tile path encoding');
  }

  // SEC: Validate tilePath (length and content) to prevent traversal/SSRF
  // SEC: Prevent access to hidden files/directories (dotfiles)
  // Bolt Optimization: Use regex instead of split/some for performance
  const hasDotfiles = DOTFILE_REGEX.test(decodedPath);

  if (decodedPath.length > 255 || !VALID_API_PATH_REGEX.test(decodedPath) || decodedPath.includes('..') || decodedPath.includes('//') || hasDotfiles) {
    return createErrorResponse(request, 400, 'Invalid tile path');
  }

  // SEC: Strict Extension Validation
  // Ensure we only proxy PNG images as expected by the frontend
  if (!decodedPath.endsWith('.png')) {
    return createErrorResponse(request, 400, 'Invalid tile format');
  }

  return decodedPath;
}

/**
 * Creates and caches a safe JSON 404 response.
 *
 * SEC: Called when an upstream 404 is not an image (e.g. an HTML error page).
 * We synthesise our own body rather than proxying theirs, so upstream markup
 * can never reach the client. The safe response is cached so a miss does not
 * hammer upstream on every retry.
 */
function handleSafe404TileResponse(request, ctx, cache, cacheKey, ttl) {
  const safeBody = JSON.stringify({
    error: {
      message: 'Tile not found',
      status: 404
    }
  });

  const safeHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${ttl}`,
    'X-Cache': 'MISS',
    'X-Upstream-Status': '404',
    'Access-Control-Allow-Origin': '*', // Store permissive, override on delivery
    ...API_SECURITY_HEADERS
  });

  const safeResponse = new Response(safeBody, { status: 404, headers: safeHeaders });

  // Cache the safe response
  ctx.waitUntil(cache.put(cacheKey, safeResponse.clone()));

  // Return to client (strict CORS)
  const clientHeaders = new Headers(safeHeaders);
  setCorsHeaders(clientHeaders, request);

  return new Response(safeBody, { status: 404, headers: clientHeaders });
}

/**
 * Processes, caches, and returns a valid tile response to the client.
 */
function handleCacheableTileResponse(request, ctx, cache, cacheKey, upstreamResponse, status, ttl) {
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
  API_SECURITY_HEADERS_ENTRIES.forEach(([key, value]) => {
    cacheHeaders.set(key, value);
  });

  const cacheResponse = new Response(cacheBody, {
    status: status,
    headers: cacheHeaders
  });

  ctx.waitUntil(cache.put(cacheKey, cacheResponse));

  // Return to Client
  const clientHeaders = new Headers(cacheHeaders);
  setCorsHeaders(clientHeaders, request);

  return new Response(clientBody, {
    status: status,
    headers: clientHeaders
  });
}

/**
 * Handle Radar Tile requests with robust caching
 * Route: /api/tiles/...
 */
async function handleTileRequest(request, env, ctx, url) {
  const tilePath = url.pathname.slice('/api/tiles'.length);

  const validatedOrError = validateTilePath(request, tilePath);
  if (validatedOrError instanceof Response) return validatedOrError;
  const decodedTilePath = validatedOrError;

  const upstreamUrl = `https://tilecache.rainviewer.com${decodedTilePath}`;
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // 1. Check Cache
  let response = await cache.match(cacheKey);

  if (response) {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', 'HIT');

    // Apply strict CORS
    setCorsHeaders(headers, request);

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
      signal: AbortSignal.timeout(TIMEOUT_API_TILES),
    });

    const status = upstreamResponse.status;

    // Log outcomes (sampled for 2xx, 100% for errors)
    const bucket = Math.floor(status / 100);
    if (bucket >= 4 || Math.random() < 0.05) {
      if (env.ENVIRONMENT !== 'production') {
        const logPath = env.DEBUG === 'true' ? decodedTilePath : '[REDACTED]';
        console.info(`Tile Proxy Bucket: ${bucket}xx (Status: ${status}) Path: ${logPath}`);
      }
    }

    // 3. Cache Determination
    // Cache success (2xx) or benign error (404). Do NOT cache 429/5xx.
    const shouldCache = upstreamResponse.ok || status === 404;
    const ttl = upstreamResponse.ok ? 7200 : 60;

    if (shouldCache) {
      const contentType = upstreamResponse.headers.get('Content-Type');
      // SEC: Strict MIME comparison, not a substring check.
      const mime = contentType ? contentType.split(';')[0].trim().toLowerCase() : '';
      const isPng = mime === 'image/png';

      // SEC: Strict Content-Type validation (success responses only).
      // Prevents XSS via MIME sniffing if upstream returns non-image content
      // (e.g. HTML). Only PNG is allowed, since we enforce the .png extension
      // in the URL — this also blocks image/svg+xml, which is scriptable.
      if (upstreamResponse.ok && !isPng) {
        if (env.ENVIRONMENT !== 'production') {
          console.error(`Upstream Tile Invalid Content-Type: ${contentType} (parsed: ${mime})`);
        }
        return createErrorResponse(request, 502, 'Invalid upstream content type');
      }

      if (status === 404 && !isPng) {
        return handleSafe404TileResponse(request, ctx, cache, cacheKey, ttl);
      }

      return handleCacheableTileResponse(request, ctx, cache, cacheKey, upstreamResponse, status, ttl);
    }

    // 4. Non-cacheable Error Handling (429, 5xx, etc)
    // SEC: The upstream body is never forwarded here — it could carry HTML or
    // stack traces. createErrorResponse builds a fresh one.
    const errorDetails = {
      'X-Upstream-Status': status.toString()
    };

    // Preserve Retry-After so the client can back off correctly on rate limits.
    if (status === 429) {
      const retryAfter = upstreamResponse.headers.get('Retry-After');
      if (retryAfter) {
        errorDetails['Retry-After'] = retryAfter;
      }
    }

    return createErrorResponse(request, status, 'Upstream tile error', errorDetails);

  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('Tile Proxy Error:', error);
    }
    return createErrorResponse(request, 502, 'Tile proxy failed');
  }
}


/**
 * Handle RainViewer API requests with caching
 */
async function handleRadarRequest(request, env, ctx) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

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
    setCorsHeaders(headers, request);

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
      signal: AbortSignal.timeout(TIMEOUT_API_RADAR),
    });

    const status = upstreamResponse.status;

    if (!upstreamResponse.ok) {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Radar API Error: Status ${status}`);
      }
      if (status === 429) {
        return createErrorResponse(request, 429, 'Upstream Rate Limit', {
          'X-Upstream-Status': '429',
          'Retry-After': '60'
        });
      }
      const emptyResponse = getEmptyRadarResponse(request);
      emptyResponse.headers.set('X-Upstream-Status', status.toString());
      return emptyResponse;
    }

    // SEC: Strict Content-Type Validation
    // Prevent cache poisoning if upstream returns HTML error page (e.g. WAF/Maintenance) with 200 OK
    // Bolt Security: Use strict MIME comparison, not substring check
    const contentType = upstreamResponse.headers.get('Content-Type');
    const mime = contentType ? contentType.split(';')[0].trim().toLowerCase() : '';

    if (mime !== 'application/json') {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Radar Invalid Content-Type: ${contentType} (parsed: ${mime})`);
      }
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
      ...API_SECURITY_HEADERS
    });

    const cacheResponse = new Response(cacheBody, {
      status: 200,
      headers: cacheHeaders,
    });

    // Save to cache
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));

    // 2. Prepare Response for Client (1 minute)
    const clientHeaders = new Headers(cacheHeaders);
    setCorsHeaders(clientHeaders, request);
    // Set client cache control
    clientHeaders.set('Cache-Control', 'public, max-age=60');

    return new Response(clientBody, {
      status: 200,
      headers: clientHeaders
    });

  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('Radar Fetch Error:', error);
    }
    return createErrorResponse(request, 502, 'Failed to fetch radar data');
  }
}
