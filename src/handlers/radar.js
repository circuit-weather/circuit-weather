/**
 * Radar routes:
 * - /api/radar   — LibreWXR metadata with RainViewer fallback and a last-known-good copy
 * - /api/tiles/* — radar and satellite tile proxy
 * - /api/alerts  — WMO CAP weather warnings around a circuit
 */

import {
  VALID_API_PATH_REGEX,
  DOTFILE_REGEX,
  recursivelyDecodePath,
  checkFetchDest,
  API_SECURITY_HEADERS,
  API_SECURITY_HEADERS_ENTRIES,
  setCorsHeaders,
  getEmptyRadarResponse,
  createErrorResponse,
  getSecureRandom,
  getParsedMimeType,
  createCacheHitResponse
} from '../worker-utils.js';
import {
  LIBREWXR_METADATA_URL,
  RAINVIEWER_METADATA_URL,
  normaliseLibreWxrMetadata,
  normaliseRainViewerMetadata,
  resolveTileUpstream,
  buildAlertsUpstreamUrl,
  sanitiseAlerts
} from '../radar-providers.js';

// Per-upstream timeouts to prevent resource exhaustion while allowing for slow upstreams
const TIMEOUT_API_RADAR = 8000;
const TIMEOUT_API_TILES = 5000;
const TIMEOUT_API_ALERTS = 8000;

// The radar response merges two providers, so it is cached under its own key
// rather than either upstream URL.
const RADAR_CACHE_KEY_URL = 'https://circuit-weather.racing/__cache/radar-v2';

// Last-known-good radar metadata, served if both radar providers fail. Its
// frames' tiles stay in the edge cache (2 hours), so playback keeps working
// through a short upstream outage.
const RADAR_STALE_KEY_URL = 'https://circuit-weather.racing/__cache/radar-v2-stale';
const RADAR_STALE_TTL = 30 * 60;

// Weather alerts change slowly; 5 minutes keeps them fresh without hammering upstream.
const ALERTS_TTL = 300;
// Last-known-good alerts, served (minus any that have since expired) if LibreWXR fails.
const ALERTS_STALE_TTL = 60 * 60;
const MAX_ALERTS_BYTES = 5 * 1024 * 1024;

const ALLOWED_TILE_HEADERS = ['Content-Type', 'Content-Length', 'Last-Modified', 'ETag', 'Date'];

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
function handleCacheableTileResponse({ request, ctx, cache, cacheKey, upstreamResponse, status, ttl }) {
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
async function checkTileCache(request, cache, cacheKey) {
  const response = await cache.match(cacheKey);
  if (!response) return null;
  return createCacheHitResponse(response, request);
}

function handleNonCacheableTileError(request, status, upstreamResponse) {
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
}

export async function handleTileRequest(request, env, ctx, url) {
  const tilePath = url.pathname.slice('/api/tiles'.length);

  const validatedOrError = validateTilePath(request, tilePath);
  if (validatedOrError instanceof Response) return validatedOrError;
  const decodedTilePath = validatedOrError;

  const resolved = resolveTileUpstream(decodedTilePath, url.searchParams, Date.now());
  if (!resolved) {
    return createErrorResponse(request, 400, 'Invalid tile path');
  }
  const { upstreamUrl, cacheKeyUrl, ttl: successTtl } = resolved;
  const cacheKey = new Request(cacheKeyUrl);
  const cache = caches.default;

  // 1. Check Cache
  const cachedResponse = await checkTileCache(request, cache, cacheKey);
  if (cachedResponse) return cachedResponse;

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

    // NOTE: This sampled logging is deliberate observability, not a leftover debug
    // statement. It is non-production only, logs 100% of 4xx/5xx and ~5% of 2xx, and
    // redacts the tile path unless DEBUG === 'true'. Do not remove it.
    // Log outcomes (sampled for 2xx, 100% for errors)
    const bucket = Math.floor(status / 100);
    if (bucket >= 4 || getSecureRandom() < 0.05) {
      if (env.ENVIRONMENT !== 'production') {
        const logPath = env.DEBUG === 'true' ? decodedTilePath : '[REDACTED]';
        console.info(`Tile Proxy Bucket: ${bucket}xx (Status: ${status}) Path: ${logPath}`);
      }
    }

    // 3. Cache Determination
    // Cache success (2xx) or benign error (404). Do NOT cache 429/5xx.
    const shouldCache = upstreamResponse.ok || status === 404;
    const ttl = upstreamResponse.ok ? successTtl : 60;

    if (shouldCache) {
      // SEC: Strict MIME comparison, not a substring check.
      const { contentType, mime } = getParsedMimeType(upstreamResponse);
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

      return handleCacheableTileResponse({ request, ctx, cache, cacheKey, upstreamResponse, status, ttl });
    }

    // 4. Non-cacheable Error Handling (429, 5xx, etc)
    return handleNonCacheableTileError(request, status, upstreamResponse);

  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('Tile Proxy Error:', error);
    }
    return createErrorResponse(request, 502, 'Tile proxy failed');
  }
}

/**
 * Check if the radar request key matches cached response.
 */
async function checkRadarCache(request, cache, cacheKey) {
  const response = await cache.match(cacheKey);
  if (!response) return null;
  // Override Cache-Control for the client to ensure frequent checks (1 min)
  return createCacheHitResponse(response, request, {
    'Cache-Control': 'public, max-age=60'
  });
}

/**
 * Perform upstream fetch to a radar metadata API.
 * Takes the URL from the caller so the fetch target and the cache key
 * cannot drift apart.
 */
async function fetchRadarData(upstreamUrl) {
  return await fetch(upstreamUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'CircuitWeather/1.0',
    },
    signal: AbortSignal.timeout(TIMEOUT_API_RADAR),
  });
}

/**
 * Fetch and normalise one radar provider's metadata.
 * Never throws: returns `{ data }` on success, otherwise `{ status }` (the
 * upstream HTTP status, or 0 for a network failure / unusable body).
 */
async function loadRadarProvider(env, name, upstreamUrl, normalise) {
  try {
    const upstreamResponse = await fetchRadarData(upstreamUrl);
    const status = upstreamResponse.status;

    if (!upstreamResponse.ok) {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Radar API Error (${name}): Status ${status}`);
      }
      return { status };
    }

    // SEC: Strict Content-Type Validation
    // Prevent cache poisoning if upstream returns HTML error page (e.g. WAF/Maintenance) with 200 OK
    const { contentType, mime } = getParsedMimeType(upstreamResponse);
    if (mime !== 'application/json') {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Radar Invalid Content-Type (${name}): ${contentType} (parsed: ${mime})`);
      }
      return { status: 0, invalid: true };
    }

    // SEC: Rebuild the payload from validated fields only
    const data = normalise(await upstreamResponse.json());
    if (!data) {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Radar API (${name}) returned no usable frames`);
      }
      return { status: 0, invalid: true };
    }
    return { data };
  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error(`Radar Fetch Error (${name}):`, error);
    }
    return { status: 0 };
  }
}

/**
 * Format and cache a normalised radar metadata response.
 */
function formatCacheableRadarResponse(request, ctx, cache, cacheKey, data) {
  const body = JSON.stringify(data);

  // 1. Prepare Response for Cache (1 minute)
  const cacheHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60', // Worker Cache TTL
    'X-Cache': 'MISS',
    'X-Radar-Provider': data.provider,
    'Access-Control-Allow-Origin': '*',
    ...API_SECURITY_HEADERS
  });

  // Save to cache, plus a longer-lived last-known-good copy
  ctx.waitUntil(cache.put(cacheKey, new Response(body, { status: 200, headers: cacheHeaders })));
  const staleHeaders = new Headers(cacheHeaders);
  staleHeaders.set('Cache-Control', `public, max-age=${RADAR_STALE_TTL}`);
  ctx.waitUntil(cache.put(new Request(RADAR_STALE_KEY_URL), new Response(body, { status: 200, headers: staleHeaders })));

  // 2. Prepare Response for Client (1 minute)
  const clientHeaders = new Headers(cacheHeaders);
  setCorsHeaders(clientHeaders, request);

  return new Response(body, {
    status: 200,
    headers: clientHeaders
  });
}

/**
 * Handle radar metadata requests with caching.
 * LibreWXR is the primary source; RainViewer is used if LibreWXR fails.
 */
export async function handleRadarRequest(request, env, ctx) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

  // Canonical cache key for the normalised (provider-merged) response
  const cacheKey = new Request(RADAR_CACHE_KEY_URL);
  const cache = caches.default;

  // Check cache match
  const cachedResponse = await checkRadarCache(request, cache, cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  const primary = await loadRadarProvider(env, 'librewxr', LIBREWXR_METADATA_URL, normaliseLibreWxrMetadata);
  if (primary.data) {
    return formatCacheableRadarResponse(request, ctx, cache, cacheKey, primary.data);
  }

  const fallback = await loadRadarProvider(env, 'rainviewer', RAINVIEWER_METADATA_URL, normaliseRainViewerMetadata);
  if (fallback.data) {
    return formatCacheableRadarResponse(request, ctx, cache, cacheKey, fallback.data);
  }

  // Both providers failed: serve the last-known-good metadata if we have it
  const stale = await cache.match(new Request(RADAR_STALE_KEY_URL));
  if (stale) {
    return createCacheHitResponse(stale, request, {
      'Cache-Control': 'public, max-age=60',
      'X-Cache': 'STALE'
    });
  }

  // Otherwise report the fallback's failure mode
  if (fallback.status === 429) {
    return createErrorResponse(request, 429, 'Upstream Rate Limit', {
      'X-Upstream-Status': '429',
      'Retry-After': '60'
    });
  }
  if (fallback.status === 0 && !fallback.invalid) {
    return createErrorResponse(request, 502, 'Failed to fetch radar data');
  }
  const emptyResponse = getEmptyRadarResponse(request);
  emptyResponse.headers.set('X-Upstream-Status', fallback.status.toString());
  return emptyResponse;
}

/**
 * Handle weather alert requests: /api/alerts?lat={lat}&lon={lon}
 * Proxies LibreWXR's WMO CAP alerts for a box around the circuit.
 */
export async function handleAlertsRequest(request, env, ctx, url) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

  const upstreamUrl = buildAlertsUpstreamUrl(url.searchParams);
  if (!upstreamUrl) {
    return createErrorResponse(request, 400, 'Invalid coordinates');
  }

  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    return createCacheHitResponse(cached, request);
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        'Accept': 'application/geo+json, application/json',
        'User-Agent': 'CircuitWeather/1.0',
      },
      signal: AbortSignal.timeout(TIMEOUT_API_ALERTS),
    });

    if (!upstreamResponse.ok) {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Alerts API Error: Status ${upstreamResponse.status}`);
      }
      return await serveStaleAlertsOrError(request, cache, upstreamUrl, 'Upstream alerts error', {
        'X-Upstream-Status': upstreamResponse.status.toString()
      });
    }

    const { mime } = getParsedMimeType(upstreamResponse);
    const declaredLength = Number(upstreamResponse.headers.get('Content-Length'));
    if ((mime !== 'application/json' && mime !== 'application/geo+json') || declaredLength > MAX_ALERTS_BYTES) {
      return await serveStaleAlertsOrError(request, cache, upstreamUrl, 'Invalid upstream alerts response');
    }

    const text = await upstreamResponse.text();
    if (text.length > MAX_ALERTS_BYTES) {
      return await serveStaleAlertsOrError(request, cache, upstreamUrl, 'Invalid upstream alerts response');
    }

    // SEC: Rebuild the payload from validated fields only
    const body = JSON.stringify(sanitiseAlerts(JSON.parse(text), Date.now()));
    const headers = new Headers({
      'Content-Type': 'application/geo+json',
      'Cache-Control': `public, max-age=${ALERTS_TTL}`,
      'X-Cache': 'MISS',
      'Access-Control-Allow-Origin': '*',
      ...API_SECURITY_HEADERS
    });
    ctx.waitUntil(cache.put(cacheKey, new Response(body, { status: 200, headers })));
    const staleHeaders = new Headers(headers);
    staleHeaders.set('Cache-Control', `public, max-age=${ALERTS_STALE_TTL}`);
    ctx.waitUntil(cache.put(getStaleAlertsCacheKey(upstreamUrl), new Response(body, { status: 200, headers: staleHeaders })));

    const clientHeaders = new Headers(headers);
    setCorsHeaders(clientHeaders, request);
    return new Response(body, { status: 200, headers: clientHeaders });
  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('Alerts Fetch Error:', error);
    }
    return await serveStaleAlertsOrError(request, cache, upstreamUrl, 'Failed to fetch weather alerts');
  }
}

function getStaleAlertsCacheKey(upstreamUrl) {
  return new Request(`${upstreamUrl}&cw_stale=1`);
}

/**
 * Serve the last-known-good alerts for this area, dropping any that expired
 * since they were cached. Falls back to a 502 when there is no copy.
 */
async function serveStaleAlertsOrError(request, cache, upstreamUrl, message, errorHeaders = {}) {
  const stale = await cache.match(getStaleAlertsCacheKey(upstreamUrl));
  if (!stale) {
    return createErrorResponse(request, 502, message, errorHeaders);
  }

  // The stored copy was already sanitised; re-running it only drops expired alerts
  const body = JSON.stringify(sanitiseAlerts(await stale.json(), Date.now()));
  const headers = new Headers(stale.headers);
  headers.set('Cache-Control', 'public, max-age=60');
  headers.set('X-Cache', 'STALE');
  setCorsHeaders(headers, request);
  return new Response(body, { status: 200, headers });
}
