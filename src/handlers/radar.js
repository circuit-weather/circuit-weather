/**
 * Radar routes:
 * - /api/radar   — LibreWXR metadata with RainViewer fallback and a last-known-good copy
 * - /api/alerts  — WMO CAP weather warnings around a circuit
 */

import {
  checkFetchDest,
  API_SECURITY_HEADERS,
  setCorsHeaders,
  getEmptyRadarResponse,
  createErrorResponse,
  getParsedMimeType,
  createCacheHitResponse
} from '../worker-utils.js';
import {
  LIBREWXR_METADATA_URL,
  RAINVIEWER_METADATA_URL,
  normaliseLibreWxrMetadata,
  normaliseRainViewerMetadata,
  buildAlertsUpstreamUrl,
  sanitiseAlerts
} from '../radar-providers.js';

// Per-upstream timeouts to prevent resource exhaustion while allowing for slow upstreams
const TIMEOUT_API_RADAR = 8000;
const TIMEOUT_API_ALERTS = 8000;

// The radar response merges two providers, so it is cached under its own key
// rather than either upstream URL.
const RADAR_CACHE_KEY_URL = 'https://circuit-weather.racing/__cache/radar-v2';

// Last-known-good radar metadata, served if both radar providers fail. The
// client loads its frames' tiles from the providers, which keep past frames for
// about 2 hours, so playback keeps working through a short upstream outage.
const RADAR_STALE_KEY_URL = 'https://circuit-weather.racing/__cache/radar-v2-stale';
const RADAR_STALE_TTL = 30 * 60;

// Weather alerts change slowly; 5 minutes keeps them fresh without hammering upstream.
const ALERTS_TTL = 300;
// Last-known-good alerts, served (minus any that have since expired) if LibreWXR fails.
const ALERTS_STALE_TTL = 60 * 60;
const MAX_ALERTS_BYTES = 5 * 1024 * 1024;

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
