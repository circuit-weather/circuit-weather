## 2026-02-18 - RateLimiter LRU Eviction Fix
**Vulnerability:** The in-memory `RateLimiter` class in `src/worker.js` used a `Map` to store IP records but failed to update the insertion order when accessing existing keys. This resulted in FIFO eviction instead of the intended LRU behavior, potentially allowing active users to be evicted prematurely during high traffic or attacks.
**Learning:** JavaScript `Map` objects preserve key insertion order. Updating a value associated with an existing key using `set()` does *not* change its position in the iteration order. To implement true LRU behavior, one must explicitly `delete()` the key and then `set()` it again to move it to the end of the Map.
**Prevention:** When implementing LRU caches using `Map` in JavaScript, always ensure that access operations (`get` or `set` updates) include a delete-then-set sequence to refresh the key's position.

## 2025-05-21 - External API Data Injection Risk
**Vulnerability:** `CircuitWeatherApp.renderForecast` injected weather unit strings from the Open-Meteo API directly into the DOM using `innerHTML` without sanitization. While the API is trusted, this created a potential XSS vector if the API response was compromised or spoofed.
**Learning:** Even trusted third-party APIs should be treated as untrusted sources when rendering data into the DOM. Always sanitize or escape any external data before injecting it via `innerHTML`.
**Prevention:** Use `textContent` where possible, or strictly escape all dynamic values when building HTML strings.

## 2026-02-20 - Worker Proxy SRI Verification
**Vulnerability:** The Cloudflare Worker proxied external Leaflet assets from `unpkg.com` without verifying their integrity. While the frontend enforced SRI via `integrity` attributes, a compromised upstream file would still be fetched and cached by the worker, causing a Denial of Service for all users as browsers blocked the mismatched resource.
**Learning:** When building a reverse proxy for external assets, frontend-only SRI is insufficient as it protects the client but poisons the edge cache. The proxy itself must verify the integrity of the upstream response before caching it.
**Prevention:** Implement server-side SRI verification in the proxy layer by buffering the response, calculating its SHA-256 hash, and comparing it against a strict allowlist before committing to cache or serving.

## 2026-02-21 - Tile Proxy Upstream Leakage
**Vulnerability:** The `handleTileRequest` in `src/worker.js` piped raw upstream response bodies (potentially HTML error pages) to the client with `Content-Type: application/json` for non-cacheable errors (429, 5xx). This could leak upstream implementation details or internal IP addresses from error pages.
**Learning:** Always sanitize upstream error responses in a proxy. Even if the client expects an image, returning a structured JSON error is safer than passing through raw HTML content which might be misinterpreted or leak information.
**Prevention:** Consume the upstream response body for error statuses and return a clean, generated JSON response with only necessary headers (like `Retry-After`).
