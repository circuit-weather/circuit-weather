/**
 * /api/track/* — proxies track GeoJSON from GitHub with 24-hour caching.
 */

import {
  VALID_TRACK_ID_REGEX,
  checkFetchDest,
  API_SECURITY_HEADERS,
  setCorsHeaders,
  createErrorResponse,
  getParsedMimeType,
  cacheAndReturnError,
  createCacheHitResponse
} from '../worker-utils.js';

// Per-upstream timeouts to prevent resource exhaustion while allowing for slow upstreams
const TIMEOUT_API_TRACKS = 10000;

/**
 * Extracts and validates track ID from request URL
 * @param {URL} url
 * @returns {string|null} trackId or null if invalid
 */
function extractAndValidateTrackId(url) {
  const trackId = url.pathname.slice('/api/track/'.length);
  // SEC: Check length (50 chars max) and format
  if (!trackId || trackId.length > 50 || !VALID_TRACK_ID_REGEX.test(trackId)) {
    return null;
  }
  return trackId;
}

/**
 * Creates response for cached track hit
 * @param {Response} response
 * @param {Request} request
 * @returns {Response}
 */
function createTrackCacheHitResponse(response, request) {
  // Ensure client caches this for a long time too (24h)
  return createCacheHitResponse(response, request, {
    'Cache-Control': 'public, max-age=86400'
  });
}

/**
 * Formats, caches, and returns track response for client
 * @param {Response} upstreamResponse
 * @param {Request} cacheKey
 * @param {Request} request
 * @param {object} ctx
 * @param {Cache} cache
 * @returns {Response}
 */
function formatCacheableTrackResponse(upstreamResponse, cacheKey, request, ctx, cache) {
  // Bolt Optimization: Stream response instead of buffering text
  const [cacheBody, clientBody] = upstreamResponse.body.tee();

  // Create cacheable response (24 hours - tracks are static)
  const cacheHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400',
    'X-Cache': 'MISS',
    'X-Upstream-Status': upstreamResponse.status.toString(),
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
}

/**
 * Fetches track data from upstream GitHub repository and caches it
 * @param {string} upstreamUrl
 * @param {Request} cacheKey
 * @param {Request} request
 * @param {object} env
 * @param {object} ctx
 * @returns {Promise<Response>}
 */
async function fetchAndCacheTrack(upstreamUrl, cacheKey, request, env, ctx) {
  const cache = caches.default;
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
    const { contentType, mime } = getParsedMimeType(upstreamResponse);

    // GitHub raw content for geojson might be text/plain or application/json
    // We should strictly allow text/plain or application/json since github raw serves text/plain
    if (mime !== 'application/json' && mime !== 'text/plain') {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Track Invalid Content-Type: ${contentType} (parsed: ${mime})`);
      }
      return cacheAndReturnError({ request, cache, cacheKey, status: 502, message: 'Invalid upstream content type', ctx });
    }

    return formatCacheableTrackResponse(upstreamResponse, cacheKey, request, ctx, cache);

  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('Track Fetch Error:', error);
    }
    return createErrorResponse(request, 502, 'Failed to fetch track data');
  }
}

/**
 * Handle Track GeoJSON requests with caching
 */
export async function handleTrackRequest(request, env, ctx, url) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

  const trackId = extractAndValidateTrackId(url);
  if (!trackId) {
    return createErrorResponse(request, 400, 'Invalid track ID');
  }

  const upstreamUrl = `https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/${trackId}.geojson`;

  // Use a canonical cache key based on the upstream URL
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // Check cache match
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return createTrackCacheHitResponse(cachedResponse, request);
  }

  return fetchAndCacheTrack(upstreamUrl, cacheKey, request, env, ctx);
}
