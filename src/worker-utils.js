// src/worker-utils.js

export const VALID_API_PATH_REGEX = /^[a-zA-Z0-9/._-]*$/;
export const VALID_TRACK_ID_REGEX = /^[a-z0-9-]+$/;
export const PRODUCTION_DOMAIN = 'https://circuit-weather.racing';
export const ALLOWED_ORIGIN_LOCALHOST_REGEX = /^http:\/\/localhost(:\d+)?(\/|$)/;
export const ALLOWED_ORIGIN_127_REGEX = /^http:\/\/127\.0\.0\.1(:\d+)?(\/|$)/;
export const ALLOWED_PREVIEW_REGEX = /^https:\/\/(.*\.)?circuit-weather\.pages\.dev(\/|$)/;
export const ALLOWED_WORKER_REGEX = /^https:\/\/([a-zA-Z0-9-]+\-)?circuit-weather.*\..*\.workers\.dev(\/|$)/;
export const DOTFILE_REGEX = /(?:^|\/)\./;

// Bolt Optimization: Reduced header set for API responses (removed HTML-specific headers)
// Removed: Permissions-Policy (~240 bytes), X-Frame-Options (redundant with CSP), X-XSS-Protection (deprecated)
export const API_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "upgrade-insecure-requests; default-src 'none'; frame-ancestors 'none'; frame-src 'none'; base-uri 'none'; form-action 'none';",
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Robots-Tag': 'noindex', // Prevent search engines from indexing API responses
};

// Bolt Optimization: Pre-compute entries to avoid Object.entries() allocation on every request
export const API_SECURITY_HEADERS_ENTRIES = Object.entries(API_SECURITY_HEADERS);


/**
 * Helper to determine allowed CORS origin
 * Returns the origin string if allowed, or null if forbidden.
 */
export function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return null; // No Origin header, no CORS headers needed (same-origin or non-browser)

  // Whitelist:
  // 1. Production domain
  // 2. Localhost/127.0.0.1 for development
  if (
    origin === PRODUCTION_DOMAIN ||
    ALLOWED_ORIGIN_LOCALHOST_REGEX.test(origin) ||
    ALLOWED_ORIGIN_127_REGEX.test(origin) ||
    ALLOWED_PREVIEW_REGEX.test(origin) ||
    ALLOWED_WORKER_REGEX.test(origin)
  ) {
    return origin;
  }

  return null;
}

/**
 * Helper to validate request source (Hotlink Protection)
 * Checks Origin and Referer headers against allowlist.
 * Returns true if allowed, false if blocked.
 */
export function checkRequestSource(request) {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const secFetchSite = request.headers.get('Sec-Fetch-Site');

  // 1. Check Sec-Fetch-Site (Strongest indicator for browsers)
  // 'same-origin' = app API call (allow)
  // 'same-site' = app API call from subdomain (allow)
  // 'none' = user typed URL / bookmarks (allow for direct access)
  // Block 'cross-site' unless Origin/Referer is whitelisted below
  if (secFetchSite && ['same-origin', 'same-site', 'none'].includes(secFetchSite)) {
    return true;
  }

  // 2. Check Origin (Strict)
  // Bolt Optimization: Regexes now support optional trailing slash/path, which is fine for Origin too
  if (origin) {
    if (
      origin !== PRODUCTION_DOMAIN &&
      !ALLOWED_ORIGIN_LOCALHOST_REGEX.test(origin) &&
      !ALLOWED_ORIGIN_127_REGEX.test(origin) &&
      !ALLOWED_PREVIEW_REGEX.test(origin) &&
      !ALLOWED_WORKER_REGEX.test(origin)
    ) {
      return false; // Invalid Origin
    }
  }

  // 3. Check Referer (Strict)
  if (referer) {
    // Bolt Optimization: Avoid new URL() parsing on hot path (~20x faster)
    // 3a. Fast path for production domain (most common)
    if (referer === PRODUCTION_DOMAIN || referer.startsWith(PRODUCTION_DOMAIN + '/')) {
      // Allowed
    }
    // 3b. Check regexes (updated to support full URL matching)
    else if (
      ALLOWED_ORIGIN_LOCALHOST_REGEX.test(referer) ||
      ALLOWED_ORIGIN_127_REGEX.test(referer) ||
      ALLOWED_PREVIEW_REGEX.test(referer) ||
      ALLOWED_WORKER_REGEX.test(referer)
    ) {
      // Allowed
    } else {
      return false; // Invalid Referer
    }
  }

  // 4. Require at least one valid identity header (Stop script scraping)
  // If we have no Sec-Fetch-Site, no Origin, and no Referer -> Block
  // Also block 'cross-site' requests if they lack Origin/Referer verification
  const isSafeSite = secFetchSite && ['same-origin', 'same-site', 'none'].includes(secFetchSite);
  if (!origin && !referer && !isSafeSite) {
    return false;
  }

  return true;
}

/**
 * Helper to validate Sec-Fetch-Dest header
 * Prevents API from being loaded as script/object (XSSI protection)
 * Returns false if blocked, true if allowed.
 */
export function checkFetchDest(request) {
  const dest = request.headers.get('Sec-Fetch-Dest');
  if (dest && ['script', 'object', 'embed', 'iframe'].includes(dest)) {
    return false;
  }
  return true;
}

/**
 * Calculates SHA-256 hash of a buffer and returns it as base64 string
 */
export async function calculateHash(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return btoa(String.fromCharCode(...hashArray));
}

/**
 * Simple In-Memory Rate Limiter
 * Note: In a serverless environment, this state is ephemeral and per-isolate.
 * It provides a "best effort" defense against rapid-fire DoS attacks on a single instance.
 */
export class RateLimiter {
  constructor(limit, windowMs, maxIps = 10000) {
    this.limit = limit; // Capacity
    this.windowMs = windowMs;
    this.rate = limit / windowMs; // Tokens per ms
    this.maxIps = maxIps;
    // Bolt Optimization: Generational Garbage Collection
    // Use two maps to avoid O(N) cleanup iteration
    this.currentGen = new Map();
    this.oldGen = new Map();
    this.lastCleanup = Date.now();
  }

  check(ip) {
    const now = Date.now();

    // Bolt Optimization: Rotate generations every windowMs
    // This provides O(1) cleanup instead of O(N) iteration
    if (now - this.lastCleanup > this.windowMs) {
      this.cleanup(now);
    }

    let record = this.currentGen.get(ip);

    if (record) {
      // Found in current generation
      const elapsed = now - record.lastCheck;
      const refill = elapsed * this.rate;
      record.tokens = Math.min(this.limit, record.tokens + refill);
      record.lastCheck = now;

      // Bolt Optimization: Move to end (LRU)
      // Delete and re-set to update insertion order
      this.currentGen.delete(ip);
      this.currentGen.set(ip, record);

      if (record.tokens >= 1) {
        record.tokens -= 1;
        return true;
      }
      return false;
    }

    // Check old generation
    record = this.oldGen.get(ip);

    if (record) {
      // Found in old generation - migrate to current if still valid
      // Note: records in oldGen are at most 2 * windowMs old, so they might be valid
      if (now - record.lastCheck <= this.windowMs) {
        const elapsed = now - record.lastCheck;
        const refill = elapsed * this.rate;
        record.tokens = Math.min(this.limit, record.tokens + refill);
        record.lastCheck = now;

        // Move to current
        this.currentGen.set(ip, record);
        this.oldGen.delete(ip); // Optional: keep memory lean

        if (record.tokens >= 1) {
          record.tokens -= 1;
          return true;
        }
        return false;
      }
    }

    // New or expired: Create new record
    // SEC: Prevent memory exhaustion DoS
    if (this.currentGen.size >= this.maxIps) {
      // If full, evict oldest entry (LRU) to make room
      // Map.keys().next() is O(1) in V8
      const oldestIp = this.currentGen.keys().next().value;
      this.currentGen.delete(oldestIp);
    }

    // Start with full tokens minus the 1 we are about to consume
    record = { tokens: this.limit - 1, lastCheck: now };
    this.currentGen.set(ip, record);
    return true;
  }

  cleanup(now) {
    // Bolt Optimization: O(1) Generational Cleanup
    // Simply rotate the maps. Old current becomes old (to be checked for migration),
    // and very old data (previous oldGen) is discarded by GC.
    this.oldGen = this.currentGen;
    this.currentGen = new Map();
    this.lastCleanup = now;
  }
}

// Helper to generate standard error headers (Security + CORS + No-Cache)
export function getErrorHeaders(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...API_SECURITY_HEADERS,
  };

  const allowedOrigin = getAllowedOrigin(request);
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Vary'] = 'Origin';
  }

  return headers;
}

// Helper to generate a generic, empty-like response to prevent frontend errors
export function getEmptyRadarResponse(request) {
  const emptyRadar = {
    radar: {
      past: [],
      nowcast: []
    },
    host: 'https://tilecache.rainviewer.com'
  };
  return new Response(JSON.stringify(emptyRadar), {
    status: 200,
    headers: getErrorHeaders(request)
  });
}
