## 2026-02-18 - RateLimiter LRU Eviction Fix
**Vulnerability:** The in-memory `RateLimiter` class in `src/worker.js` used a `Map` to store IP records but failed to update the insertion order when accessing existing keys. This resulted in FIFO eviction instead of the intended LRU behavior, potentially allowing active users to be evicted prematurely during high traffic or attacks.
**Learning:** JavaScript `Map` objects preserve key insertion order. Updating a value associated with an existing key using `set()` does *not* change its position in the iteration order. To implement true LRU behavior, one must explicitly `delete()` the key and then `set()` it again to move it to the end of the Map.
**Prevention:** When implementing LRU caches using `Map` in JavaScript, always ensure that access operations (`get` or `set` updates) include a delete-then-set sequence to refresh the key's position.

## 2025-05-21 - External API Data Injection Risk
**Vulnerability:** `CircuitWeatherApp.renderForecast` injected weather unit strings from the Open-Meteo API directly into the DOM using `innerHTML` without sanitization. While the API is trusted, this created a potential XSS vector if the API response was compromised or spoofed.
**Learning:** Even trusted third-party APIs should be treated as untrusted sources when rendering data into the DOM. Always sanitize or escape any external data before injecting it via `innerHTML`.
**Prevention:** Use `textContent` where possible, or strictly escape all dynamic values when building HTML strings.
