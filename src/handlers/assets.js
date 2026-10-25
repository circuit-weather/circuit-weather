/**
 * /api/assets/* — proxies Leaflet and Mapbox GL JS library assets with SRI
 * verification and 1-year immutable caching.
 */

import {
  calculateHash,
  API_SECURITY_HEADERS,
  setCorsHeaders,
  createErrorResponse,
  getParsedMimeType,
  createCacheHitResponse
} from '../worker-utils.js';

// Per-upstream timeouts to prevent resource exhaustion while allowing for slow upstreams
const TIMEOUT_API_ASSETS = 10000;

const VENDOR_ASSETS = new Map([
  // Leaflet Assets
  ['leaflet.js', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    contentTypes: ['application/javascript', 'text/javascript'], // Allow both standard and legacy
    integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
  }],
  ['leaflet.css', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    contentTypes: ['text/css'],
    integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
  }],
  ['images/layers.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-Hbvp0CjikvNvy6j4s6KNXokydU/CIVuaxp5M3s9RB8Y='
  }],
  ['images/layers-2x.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-Bm2sqFDY/77wB68AsG6sABVyje4nnFHzy2xxbffELt8='
  }],
  ['images/marker-icon.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-V0w6XMqF9BFAhbaEFZbWLwDXyJLHsD8oy/owHesdxDc='
  }],
  ['images/marker-icon-2x.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-ABecTB7oMNOhCEEq4NKU9Vd2z+sIXGASmjmqb8SuJSg='
  }],
  ['images/marker-shadow.png', {
    upstream: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    contentTypes: ['image/png'],
    integrity: 'sha256-Jk9cZAM58ELdcpBiz8BMF/jqDymIK1OOOEjtjxDttNo='
  }],

  // Mapbox GL JS Assets
  // NOTE: We only proxy and cache the software libraries (JS/CSS) here for strict CSP compliance.
  // This is completely acceptable under Mapbox's Terms of Service. Mapbox's strict anti-caching ToS
  // only applies to "Licensed Map Content" (tiles, styles, geocoding API responses), which our app
  // fetches directly client-side, bypassing this worker.
  // Because these static files are heavily cached by Cloudflare, it will cause `api.mapbox.com` to show
  // a very high cache rate in Cloudflare analytics. This is expected and is NOT a ToS violation.
  ['mapbox-gl.js', {
    upstream: 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js',
    contentTypes: ['application/javascript', 'text/javascript'],
    integrity: 'sha256-XievuhzYVFGutWsnId8IFgRDPUifg9ukMeHybMz1zGA='
  }],
  ['mapbox-gl.css', {
    upstream: 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css',
    contentTypes: ['text/css'],
    integrity: 'sha256-zy0HsKcYGtHYBDlDLGruL8UAMxlizCfK+kpn6NAOf+8='
  }]
]);

/**
 * Handle Vendor Assets proxy to enable strict CSP and bypass tracking blockers
 * Proxies JS, CSS, and images from unpkg and Mapbox CDNs
 */
export async function handleAssetRequest(request, env, ctx, url) {

  const path = url.pathname.slice('/api/assets/'.length);

  const config = VENDOR_ASSETS.get(path);
  if (!config) {
    return createErrorResponse(request, 404, 'File not found');
  }

  const upstreamUrl = config.upstream;
  const cacheKey = new Request(upstreamUrl);
  const cache = caches.default;

  let response = await cache.match(cacheKey);

  if (response) {
    return createCacheHitResponse(response, request);
  }

  return await fetchAndCacheVendorAsset({ request, env, ctx, path, config, cache, cacheKey });
}

/**
 * Helper to fetch, validate, and cache vendor assets
 */
async function fetchAndCacheVendorAsset({ request, env, ctx, path, config, cache, cacheKey }) {
  const upstreamUrl = config.upstream;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'CircuitWeather/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_API_ASSETS),
    });

    const status = upstreamResponse.status;
    if (!upstreamResponse.ok) {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Vendor Asset Fetch Error (${path}): ${status}`);
      }
      return createErrorResponse(request, 502, 'Failed to load vendor asset', {
        'X-Upstream-Status': status.toString()
      });
    }

    // SEC: Validate Content-Type
    // Bolt Security: Use strict MIME comparison, not substring check
    const { contentType, mime } = getParsedMimeType(upstreamResponse);
    const isValidType = config.contentTypes.includes(mime);

    if (!isValidType) {
      if (env.ENVIRONMENT !== 'production') {
        console.error(`Vendor Asset Invalid Content-Type (${path}): ${contentType} (expected ${config.contentTypes.join(' or ')})`);
      }
      return createErrorResponse(request, 502, 'Invalid upstream content type');
    }

    // SEC: Buffer response for SRI Verification
    const buffer = await upstreamResponse.arrayBuffer();

    // Verify Hash
    if (config.integrity) {
      const hash = await calculateHash(buffer);
      if (hash !== config.integrity) {
        if (env.ENVIRONMENT !== 'production') {
          console.error(`SRI Mismatch for ${path}: expected ${config.integrity}, got ${hash}`);
        }
        return createErrorResponse(request, 502, 'SRI Integrity Check Failed', {
          'X-SRI-Status': 'mismatch'
        });
      }
    }

    // Use the first allowed content type as the canonical one for the client response
    const canonicalType = config.contentTypes[0];

    const cacheHeaders = new Headers({
      'Content-Type': canonicalType, // Enforce strict/canonical type
      'Cache-Control': 'public, max-age=31536000, immutable', // Long cache for versioned file
      'X-Cache': 'MISS',
      'X-Upstream-Status': status.toString(),
      ...API_SECURITY_HEADERS
    });

    // Cache it (Clone the response from buffer)
    ctx.waitUntil(cache.put(cacheKey, new Response(buffer, { headers: cacheHeaders })));

    const clientHeaders = new Headers(cacheHeaders);
    setCorsHeaders(clientHeaders, request);

    // Return to client (from buffer)
    return new Response(buffer, {
      status: 200,
      headers: clientHeaders
    });

  } catch (error) {
    if (env.ENVIRONMENT !== 'production') {
      console.error('Vendor Asset Proxy Error:', error);
    }
    return createErrorResponse(request, 502, 'Vendor asset fetch failed');
  }
}
