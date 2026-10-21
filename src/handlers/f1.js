import {
  checkFetchDest,
  recursivelyDecodePath,
  DOTFILE_REGEX,
  VALID_API_PATH_REGEX,
  getParsedMimeType,
  API_SECURITY_HEADERS,
  createErrorResponse,
  setCorsHeaders,
  cacheAndReturnError,
  createCacheHitResponse
} from '../worker-utils.js';

const TIMEOUT_API_F1 = 5000;

/**
 * Validates the API path for security and format.
 * Returns an error Response if invalid, or a valid decoded path string.
 */
export function validateApiPath(request, rawPath) {
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
export async function checkApiCache(request, cache, cacheKey) {
  const response = await cache.match(cacheKey);
  if (!response) return null;
  return createCacheHitResponse(response, request);
}

/**
 * Fetches F1 API data from upstream, validates response, caches it, and returns it to client.
 */
export async function fetchAndCacheApiRequest({ request, env, ctx, upstreamUrl, cache, cacheKey }) {
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
    const { contentType, mime } = getParsedMimeType(upstreamResponse);

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
