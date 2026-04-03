# Bolt's Journal

## 2024-05-23 - Animation Loop Optimization
**Learning:** `setInterval` for animation loops is an anti-pattern even for low-framerate animations because it drifts and consumes CPU in background tabs.
**Action:** Use `requestAnimationFrame` with a time-delta check to handle variable framerates efficiently.

## 2024-05-24 - Timeline Loop Optimization
**Learning:** Optimizing sorted time-series processing with an early `break` reduced iterations significantly (from O(N) to O(k)).
**Action:** Always look for early exit conditions when processing sorted arrays.

## 2024-05-24 - Theme FOUC Prevention
**Learning:** A static inline script in `<head>` is the most performant way to prevent theme FOUC, but it requires updating CSP with a SHA-256 hash to maintain security.
**Action:** When adding inline initialization scripts, always calculate the SHA-256 hash and add it to `script-src` instead of using `'unsafe-inline'`.

## 2024-05-25 - Worker Regex Optimization
**Learning:** Pre-compiling regular expressions in Cloudflare Worker hot paths (like CORS checks and Input Validation) yields significant performance improvements (measured ~79% faster in micro-benchmarks) compared to inline instantiation.
**Action:** Always lift static regexes to top-level constants in serverless functions to avoid recompilation overhead on every request.

## 2024-05-25 - RateLimiter Saturation Optimization
**Learning:** Naive cleanup strategies (O(N) scan) in `RateLimiter` classes become a Denial-of-Service vector under high load/saturation, consuming significant CPU (measured ~98% overhead).
**Action:** Throttle expensive cleanup operations and rely on O(1) LRU eviction when memory limits are reached to maintain throughput during attacks.

## 2024-05-25 - RateLimiter Generational Cleanup
**Learning:** Throttled O(N) cleanup in RateLimiters is still insufficient under sustained attack as it blocks the event loop periodically.
**Action:** Implement Generational Garbage Collection (Double Buffering) to achieve O(1) cleanup by simply rotating Maps, eliminating iteration entirely.

## 2024-05-26 - Worker Request Allocations
**Learning:** `split('/').some()` for path validation and inline `Map` creation in request handlers create significant per-request allocation overhead (measured ~100x slower for map creation).
**Action:** Hoist all static configuration (Maps, Arrays, Regexes) to module-level constants to leverage isolate reuse and replace string splitting with regex checks in hot paths.

## 2024-05-26 - URL Parsing Overhead
**Learning:** `new URL()` instantiation in high-traffic request handlers (like Referer/Origin validation) is significantly slower (measured ~20x) than direct string matching or pre-compiled regex checks.
**Action:** Replace `new URL()` with `startsWith()` or Regex checks for origin validation in hot paths, especially in serverless environments where every millisecond of execution time counts.

## 2024-05-27 - CSS Variable Access in Animation Loops
**Learning:** `getComputedStyle(element).getPropertyValue()` forces a synchronous style recalculation (reflow), which causes significant layout thrashing when called inside frequent event handlers (like `zoomend` or `draw` loops).
**Action:** Cache CSS variable values in component state and update them only when the theme changes (via `MutationObserver` or explicit callback), rather than querying the DOM on every render frame.

## 2026-04-03 - DocumentFragment DOM Batching Optimization
**Learning:** Appending elements directly to the DOM inside a loop causes synchronous reflows/repaints for each iteration, which leads to layout thrashing and poor performance (O(N) layout recalculations).
**Action:** Use `DocumentFragment` to build DOM structures off-screen within loops, and append the complete fragment to the DOM in a single operation to batch updates and reduce reflows to O(1).
