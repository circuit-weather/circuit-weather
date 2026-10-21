import {
  checkFetchDest,
  getEmptyRadarResponse,
  getParsedMimeType,
  API_SECURITY_HEADERS,
  createErrorResponse,
  setCorsHeaders,
  createCacheHitResponse
} from '../worker-utils.js';

const TIMEOUT_API_RADAR = 8000;

/**
 * Check if the radar request key matches cached response.
 */
export async function checkRadarCache(request, cache, cacheKey) {
  const response = await cache.match(cacheKey);
  if (!response) return null;
  // Override Cache-Control for the client to ensure frequent checks (1 min)
  return createCacheHitResponse(response, request, {
    'Cache-Control': 'public, max-age=60'
  });
}

/**
 * Perform upstream fetch to RainViewer API.
 * Takes the URL from the caller so the fetch target and the cache key
 * cannot drift apart.
 */
export async function fetchRadarData(upstreamUrl) {
  return await fetch(upstreamUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'CircuitWeather/1.0',
    },
    signal: AbortSignal.timeout(TIMEOUT_API_RADAR),
  });
}

/**
 * Validate upstream radar response status and Content-Type.
 * Returns an error Response if invalid, or null if response is valid.
 */
export function handleRadarUpstreamError(request, env, upstreamResponse) {
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
  const { contentType, mime } = getParsedMimeType(upstreamResponse);

  if (mime !== 'application/json') {
    if (env.ENVIRONMENT !== 'production') {
      console.error(`Upstream Radar Invalid Content-Type: ${contentType} (parsed: ${mime})`);
    }
    return getEmptyRadarResponse(request);
  }

  return null;
}

/**
 * Format and cache successful radar API response.
 */
export function formatCacheableRadarResponse(request, ctx, cache, cacheKey, upstreamResponse) {
  const status = upstreamResponse.status;

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
  clientHeaders.set('Cache-Control', 'public, max-age=60');

  return new Response(clientBody, {
    status: 200,
    headers: clientHeaders
  });
}

/**
 * Handle RainViewer API requests with caching
 */
export async function handleRadarRequest(request, env, ctx) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

  const upstreamUrl = 'https://api.rainviewer.com/public/weather-maps.json';
  // Canonical cache key
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // Check cache match
  const cachedResponse = await checkRadarCache(request, cache, cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const upstreamResponse = await fetchRadarData(upstreamUrl);

    const upstreamErrorResponse = handleRadarUpstreamError(request, env, upstreamResponse);
    if (upstreamErrorResponse) {
      return upstreamErrorResponse;
    }

    return formatCacheableRadarResponse(request, ctx, cache, cacheKey, upstreamResponse);

  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('Radar Fetch Error:', error);
    }
    return createErrorResponse(request, 502, 'Failed to fetch radar data');
  }
}
