import {
  checkFetchDest,
  createErrorResponse,
  API_SECURITY_HEADERS,
  setCorsHeaders,
  createCacheHitResponse
} from '../worker-utils.js';

/**
 * Checks connectivity to a single upstream API endpoint.
 * Returns HTTP status code or 'unreachable' on failure.
 */
export async function checkUpstreamHealth(name, targetUrl, env) {
  try {
    const res = await fetch(targetUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': 'CircuitWeather-Health/1.0' },
      signal: AbortSignal.timeout(2000)
    });
    return res.status;
  } catch (e) {
    if (env.ENVIRONMENT !== 'production') {
      console.error(`Health check failed for ${name}:`, e);
    }
    return 'unreachable';
  }
}

/**
 * Checks connectivity to all configured upstream APIs concurrently.
 */
export async function checkAllUpstreams(upstreams, env) {
  const entries = Object.entries(upstreams);
  const results = {};
  const checks = entries.map(async ([name, url]) => {
    results[name] = await checkUpstreamHealth(name, url, env);
  });

  await Promise.all(checks);
  return results;
}

/**
 * Handle Health Check request
 * Checks connectivity to key upstream APIs and returns basic system status.
 */
export async function handleHealthRequest(request, env, ctx, url) {
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
    return createCacheHitResponse(response, request);
  }

  const upstreams = {
    jolpica: 'https://api.jolpi.ca/ergast/f1/current.json',
    rainviewer: 'https://api.rainviewer.com/public/weather-maps.json',
    github: 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/au-1953.geojson'
  };

  const results = await checkAllUpstreams(upstreams, env);

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

  const cacheResponse = new Response(body, {
    status: 200,
    headers: headers
  });

  ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()));

  const clientHeaders = new Headers(headers);
  setCorsHeaders(clientHeaders, request);

  return new Response(body, {
    status: 200,
    headers: clientHeaders
  });
}
