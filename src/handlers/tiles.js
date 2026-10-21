import {
  recursivelyDecodePath,
  DOTFILE_REGEX,
  VALID_API_PATH_REGEX,
  getParsedMimeType,
  getSecureRandom,
  API_SECURITY_HEADERS,
  API_SECURITY_HEADERS_ENTRIES,
  createErrorResponse,
  setCorsHeaders,
  createCacheHitResponse
} from '../worker-utils.js';

const TIMEOUT_API_TILES = 5000;
const ALLOWED_TILE_HEADERS = ['Content-Type', 'Content-Length', 'Last-Modified', 'ETag', 'Date'];

/**
 * Validates the radar tile path for security and format.
 * Returns an error Response if invalid, or a valid decoded path string.
 */
export function validateTilePath(request, tilePath) {
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
 * hammer RainViewer.
 */
export function handleSafe404TileResponse(request, ctx, cache, cacheKey, ttl) {
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
export function handleCacheableTileResponse({ request, ctx, cache, cacheKey, upstreamResponse, status, ttl }) {
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
 * Check if the tile request key matches cached response.
 */
export async function checkTileCache(request, cache, cacheKey) {
  const response = await cache.match(cacheKey);
  if (!response) return null;
  return createCacheHitResponse(response, request);
}

export function handleNonCacheableTileError(request, status, upstreamResponse) {
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

/**
 * Handle Radar Tile requests with robust caching
 * Route: /api/tiles/...
 */
export async function handleTileRequest(request, env, ctx, url) {
  const tilePath = url.pathname.slice('/api/tiles'.length);

  const validatedOrError = validateTilePath(request, tilePath);
  if (validatedOrError instanceof Response) return validatedOrError;
  const decodedTilePath = validatedOrError;

  const upstreamUrl = `https://tilecache.rainviewer.com${decodedTilePath}`;
  const cacheKey = new Request(upstreamUrl);
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
    const ttl = upstreamResponse.ok ? 7200 : 60;

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
