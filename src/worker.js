/**
 * Cloudflare Worker with Asset Handling
 * 
 * Handles API proxy requests to:
 * - /api/f1/*
 * - /api/health
 * - /api/radar
 * - /api/tiles/*
 * - /api/alerts
 * - /api/track/*
 * - /api/assets/*
 * - /api/config
 * 
 * Static assets and SPA fallback are handled by Cloudflare's asset configuration
 * via wrangler.toml's run_worker_first and not_found_handling settings.
 */

import {
  checkRequestSource,
  RateLimiter,
  API_SECURITY_HEADERS,
  getAllowedOrigin,
  createErrorResponse
} from './worker-utils.js';
import { handleApiRequest } from './handlers/f1.js';
import { handleHealthRequest } from './handlers/health.js';
import { handleRadarRequest, handleTileRequest, handleAlertsRequest } from './handlers/radar.js';
import { handleTrackRequest } from './handlers/track.js';
import { handleAssetRequest } from './handlers/assets.js';
import { handleConfigRequest } from './handlers/config.js';

// 1000 requests per minute per IP per isolate (Increased for tile support)
const limiter = new RateLimiter(1000, 60000);

export default {
  async fetch(request, env, ctx) {
    try {
      // SEC: Application Layer Rate Limiting
      // CF-Connecting-IP is set by Cloudflare's edge, which overwrites any client-supplied value, so it cannot be spoofed by callers.
      // Do NOT add custom IP-format validation that falls back to a shared '127.0.0.1': malformed/unusual values (e.g. IPv6 forms the regex
      // misses) would all collapse into one rate-limit bucket, letting a few clients exhaust the limit for everyone (DoS).
      const clientIp = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
      if (!limiter.check(clientIp)) {
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

      // Handle weather alert requests
      if (path === '/api/alerts') {
        return handleAlertsRequest(request, env, ctx, url);
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
    } catch (error) {
      // Last-resort net for anything the route handlers did not catch, so the
      // worker returns a structured 500 instead of a raw runtime failure.
      if (env.ENVIRONMENT !== 'production') {
        console.error('Worker error:', error);
      }
      // SEC: the error name/message are never returned to the client — they can
      // carry internal paths or upstream detail. createErrorResponse applies the
      // strict per-origin CORS from getErrorHeaders(); do not widen it here.
      return createErrorResponse(request, 500, 'Internal Server Error');
    }
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
