/**
 * /api/f1/* — proxies the Jolpica F1 API with 24-hour edge caching and a
 * 30-day last-known-good copy served when Jolpica fails.
 */

import {
  VALID_API_PATH_REGEX,
  DOTFILE_REGEX,
  recursivelyDecodePath,
  checkFetchDest,
  API_SECURITY_HEADERS,
  setCorsHeaders,
  createErrorResponse,
  getParsedMimeType,
  getErrorCacheTTL,
  cacheAndReturnError,
  createCacheHitResponse
} from '../worker-utils.js';

// Per-upstream timeouts to prevent resource exhaustion while allowing for slow upstreams
const TIMEOUT_API_F1 = 5000;

// Jolpica rate-limits by IP, and Workers share Cloudflare's egress IPs with other
// tenants, so 429s can happen regardless of our own traffic. Each successful F1 API
// response is also kept as a long-lived "last known good" copy under a separate
// cache key, and served when Jolpica fails rather than returning an error.
const STALE_API_TTL = 30 * 24 * 60 * 60; // 30 days
export const JOLPICA_SCHEDULE_URL = 'https://api.jolpi.ca/ergast/f1/current.json';

/**
 * Validates the API path for security and format.
 * Returns an error Response if invalid, or a valid decoded path string.
 */
function validateApiPath(request, rawPath) {
  // SEC: Recursively decode path to prevent multiple-encoding bypasses
  let apiPath = recursivelyDecodePath(rawPath);
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

  return apiPath;
}

/**
 * Checks cache for F1 API response and returns hit Response if found.
 */
async function checkApiCache(request, cache, cacheKey) {
  const response = await cache.match(cacheKey);
  if (!response) return null;
  return createCacheHitResponse(response, request);
}

/**
 * Fetches F1 API data from upstream, validates response, caches it, and returns it to client.
 */
async function fetchAndCacheApiRequest({ request, env, ctx, upstreamUrl, cache, cacheKey }) {
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
      return serveStaleOrError({ request, cache, cacheKey, upstreamUrl, status, message: 'Upstream API error', ctx });
    }

    // SEC: Strict Content-Type Validation
    // Prevent cache poisoning if upstream returns HTML error page with 200 OK
    // Bolt Security: Use strict MIME comparison, not substring check
    const { contentType, mime } = getParsedMimeType(upstreamResponse);

    if (mime !== 'application/json') {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Upstream Invalid Content-Type: ${contentType} (parsed: ${mime})`);
      }
      return serveStaleOrError({ request, cache, cacheKey, upstreamUrl, status: 502, message: 'Invalid upstream content type', ctx });
    }

    // Bolt Optimization: Stream response instead of buffering text
    const [cacheBody, rest] = upstreamResponse.body.tee();
    const [staleBody, clientBody] = rest.tee();

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

    // Save the long-lived "last known good" copy
    const staleHeaders = new Headers(cacheHeaders);
    staleHeaders.set('Cache-Control', `public, max-age=${STALE_API_TTL}`);
    ctx.waitUntil(cache.put(getStaleApiCacheKey(upstreamUrl), new Response(staleBody, {
      status: 200,
      headers: staleHeaders,
    })));

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
    const staleResponse = await serveStale({ request, cache, cacheKey, upstreamUrl, status: 502, ctx });
    if (staleResponse) return staleResponse;
    return createErrorResponse(request, 502, 'Failed to fetch from upstream');
  }
}

/**
 * Cache key for the long-lived "last known good" copy of an F1 API response.
 */
function getStaleApiCacheKey(upstreamUrl) {
  const staleUrl = new URL(upstreamUrl);
  staleUrl.searchParams.set('cw_stale', '1');
  return new Request(staleUrl.toString());
}

/**
 * Serves the last known good F1 API response after an upstream failure, if one is cached.
 * The stale copy is also written to the primary cache key for the usual error TTL, so
 * upstream isn't retried on every request while it is failing.
 * @returns {Promise<Response|null>} null if no stale copy is available
 */
async function serveStale({ request, cache, cacheKey, upstreamUrl, status, ctx }) {
  let stale;
  try {
    stale = await cache.match(getStaleApiCacheKey(upstreamUrl));
  } catch {
    return null;
  }
  if (!stale) return null;

  const body = await stale.text();
  const headers = new Headers(stale.headers);
  headers.set('Cache-Control', `public, max-age=${getErrorCacheTTL(status)}`);
  headers.set('X-Cache', 'STALE');
  headers.set('X-Upstream-Status', status.toString());

  ctx.waitUntil(cache.put(cacheKey, new Response(body, { status: 200, headers })));

  const clientHeaders = new Headers(headers);
  setCorsHeaders(clientHeaders, request);
  return new Response(body, { status: 200, headers: clientHeaders });
}

/**
 * Serves the last known good F1 API response if available, otherwise caches and returns the error.
 */
async function serveStaleOrError({ request, cache, cacheKey, upstreamUrl, status, message, ctx }) {
  const staleResponse = await serveStale({ request, cache, cacheKey, upstreamUrl, status, ctx });
  if (staleResponse) return staleResponse;
  return cacheAndReturnError({ request, cache, cacheKey, status, message, ctx });
}

/**
 * Handle F1 API requests with caching
 */
export async function handleApiRequest(request, env, ctx, url) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

  // Extract path parameters after /api/f1/
  // e.g. /api/f1/current -> current
  const rawPath = url.pathname.slice('/api/f1/'.length);

  const validatedOrError = validateApiPath(request, rawPath);
  if (validatedOrError instanceof Response) return validatedOrError;
  const apiPath = validatedOrError;

  // Build upstream URL
  const upstreamUrl = `https://api.jolpi.ca/ergast/f1/${apiPath}`;

  // Cache key based on the full upstream URL
  // SEC: Normalize cache key to URL only to prevent cache busting via headers
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  // Check cache match
  // Intentionally terse one-line early returns (and 'return await' for the final call), matching the style used throughout this file.
  // Expanding to braces / dropping 'await' is purely cosmetic; do not re-propose.
  const cachedResponse = await checkApiCache(request, cache, cacheKey);
  if (cachedResponse) return cachedResponse;

  return await fetchAndCacheApiRequest({ request, env, ctx, upstreamUrl, cache, cacheKey });
}
