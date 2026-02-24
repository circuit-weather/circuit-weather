## 2026-02-24 - [Testing LRU Eviction Policies]
**Learning:** When testing cache eviction (like in `RateLimiter`), simply checking if an item "exists" isn't enough. You must verify that the evicted item is treated as a *fresh* entry (e.g., full token bucket) upon re-access, distinguishing it from an existing but depleted entry.
**Action:** Use small capacity limits (e.g., `maxIps=2`) in tests to force eviction with minimal setup, and verify the state reset of the evicted item.

## 2026-03-01 - [Testing Generational Cache Expiry]
**Learning:** In generational caches (like `RateLimiter`), "Migration" (valid old entry) and "Expiration" (stale old entry) can appear functionally identical (both result in a valid/full bucket). To distinguish them, assert on internal state side-effects: a migrated entry is *removed* from the old generation, while an expired entry is *abandoned* in the old generation (and a new one created).
**Action:** When testing cache lifecycle, don't just check the return value; inspect the internal storage structures (`oldGen` vs `currentGen`) to verify the correct path was taken.

## 2026-03-04 - [Testing Browser APIs in Node Environment]
**Learning:** Browser APIs like `localStorage` are not available in the default `vitest` Node environment. They must be explicitly mocked using `vi.stubGlobal` to avoid "ReferenceError".
**Action:** Use `vi.stubGlobal` to mock global objects, and always clean up with `vi.unstubAllGlobals` in `afterEach` to prevent test pollution.
