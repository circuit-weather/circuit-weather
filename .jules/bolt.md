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
