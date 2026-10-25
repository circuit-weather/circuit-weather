/**
 * /api/health — reports upstream connectivity, version and status, cached for 60 seconds.
 */

import {
  checkFetchDest,
  API_SECURITY_HEADERS,
  setCorsHeaders,
  createErrorResponse,
  createCacheHitResponse
} from '../worker-utils.js';
import { LIBREWXR_METADATA_URL, RAINVIEWER_METADATA_URL } from '../radar-providers.js';
import { JOLPICA_SCHEDULE_URL } from './f1.js';

/**
 * Checks connectivity to a single upstream API endpoint.
 * Returns HTTP status code or 'unreachable' on failure.
 */
async function checkUpstreamHealth(name, targetUrl, env) {
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
async function checkAllUpstreams(upstreams, env) {
  const entries = Object.entries(upstreams);
  const results = {};
  const checks = entries.map(async ([name, url]) => {
    results[name] = await checkUpstreamHealth(name, url, env);
  });

  await Promise.all(checks);
  return results;
}

/**
 * Returns the upstream status recorded on a cached API response, or null if none is cached.
 */
async function getCachedUpstreamStatus(cache, upstreamUrl) {
  const cached = await cache.match(new Request(upstreamUrl));
  if (!cached) return null;
  const status = Number(cached.headers.get('X-Upstream-Status'));
  return status > 0 ? status : cached.status;
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
    jolpica: JOLPICA_SCHEDULE_URL,
    librewxr: LIBREWXR_METADATA_URL,
    rainviewer: RAINVIEWER_METADATA_URL,
    github: 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/au-1953.geojson'
  };

  // Avoid spending Jolpica's per-IP rate limit on health probes: report the status of
  // the most recent schedule fetch when one is cached, and only probe when none is.
  const cachedJolpicaStatus = await getCachedUpstreamStatus(cache, JOLPICA_SCHEDULE_URL);
  if (cachedJolpicaStatus !== null) delete upstreams.jolpica;

  const results = await checkAllUpstreams(upstreams, env);
  if (cachedJolpicaStatus !== null) results.jolpica = cachedJolpicaStatus;

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
