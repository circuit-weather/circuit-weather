## 2026-02-24 - [Testing LRU Eviction Policies]
**Learning:** When testing cache eviction (like in `RateLimiter`), simply checking if an item "exists" isn't enough. You must verify that the evicted item is treated as a *fresh* entry (e.g., full token bucket) upon re-access, distinguishing it from an existing but depleted entry.
**Action:** Use small capacity limits (e.g., `maxIps=2`) in tests to force eviction with minimal setup, and verify the state reset of the evicted item.
