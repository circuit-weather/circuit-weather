## 2024-04-27 - Mapbox Map vs Leaflet Map Mocks
**Learning:** In Map-related unit tests (e.g. `WeatherRadar`), the component detects the engine using `!this.map.hasLayer` to infer a Mapbox map instance versus Leaflet. To test Mapbox logic correctly, the `mockMap` must omit the `hasLayer` function, otherwise Leaflet logic takes precedence.
**Action:** Added targeted mapbox test blocks mocking an object without `hasLayer` while preserving `vi.useFakeTimers()` execution logic using `try...finally { vi.useRealTimers(); }` to prevent leakage.
