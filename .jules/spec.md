## 2024-04-27 - Mapbox Map vs Leaflet Map Mocks
**Learning:** In Map-related unit tests (e.g. `WeatherRadar`), the component detects the engine using `!this.map.hasLayer` to infer a Mapbox map instance versus Leaflet. To test Mapbox logic correctly, the `mockMap` must omit the `hasLayer` function, otherwise Leaflet logic takes precedence.
**Action:** Added targeted mapbox test blocks mocking an object without `hasLayer` while preserving `vi.useFakeTimers()` execution logic using `try...finally { vi.useRealTimers(); }` to prevent leakage.
## 2026-04-30 - Coverage Fractional Over-tuning Danger
**Learning:** Bumping coverage thresholds to exact fractional values (like 98.78%) makes the CI build extremely brittle, as a tiny code change can drop coverage by 0.01% and fail. Also, threshold increases should stop after hitting healthy standards (~80%) to avoid chasing vanity metrics.
**Action:** Reverted a fractional threshold bump in `vitest.config.js` while keeping the new test logic intact.
