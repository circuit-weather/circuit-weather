## 2024-04-27 - Mapbox Map vs Leaflet Map Mocks
**Learning:** In Map-related unit tests (e.g. `WeatherRadar`), the component detects the engine using `!this.map.hasLayer` to infer a Mapbox map instance versus Leaflet. To test Mapbox logic correctly, the `mockMap` must omit the `hasLayer` function, otherwise Leaflet logic takes precedence.
**Action:** Added targeted mapbox test blocks mocking an object without `hasLayer` while preserving `vi.useFakeTimers()` execution logic using `try...finally { vi.useRealTimers(); }` to prevent leakage.
## 2026-04-30 - Coverage Fractional Over-tuning Danger
**Learning:** Bumping coverage thresholds to exact fractional values (like 98.78%) makes the CI build extremely brittle, as a tiny code change can drop coverage by 0.01% and fail. Also, threshold increases should stop after hitting healthy standards (~80%) to avoid chasing vanity metrics.
**Action:** Reverted a fractional threshold bump in `vitest.config.js` while keeping the new test logic intact.
## 2024-05-15 - Worker Test Environment Mocking
**Learning:** In Vitest, when testing Cloudflare Worker logic (e.g., `worker.js`), `env` and `ctx` are standard function arguments passed to the `fetch` handler, not global variables. Stubbing them globally with `vi.stubGlobal()` is incorrect and leads to ReferenceErrors in test environments that strictly enforce module boundaries (like `workerd`). Also, applying `vi.stubGlobal('fetch', mockFetch)` without eventually calling `vi.unstubAllGlobals()` causes permanent test pollution that breaks downstream tests sharing the same thread.
**Action:** When testing worker `fetch` logic, created local `mockEnv` and `mockCtx` objects and passed them directly into the method. Additionally, ensured `vi.unstubAllGlobals()` is called in the test block's `afterEach` (while being mindful of top-level mocks) to prevent leaking global overrides.
## 2024-05-18 - Mapbox runtime error and tileload/unload tests
**Learning:** Adding test coverage for Mapbox requires fully stubbing `document.createElement` when DOM injection is complex (like map zoom controls). It's also critical to mock event listeners on `document.getElementById` appropriately for `WeatherRadar` which attaches to global keyboard events and updates DOM elements based on translations during map state events.
**Action:** Added new tests in `map-manager.test.js` and `weather-radar.test.js` covering error handling and branch paths, while keeping coverage thresholds strictly within the 98% business standard without incrementally ratcheting them up for vanity metrics.
## 2026-05-20 - Vitest Fake Timers Flakiness Trap
**Learning:** Fixing a "flaky" `setTimeout` test by removing it entirely and calling a mocked callback synchronously violates the requirement to preserve asynchronous testing intent. If `vi.useFakeTimers()` is active, `setTimeout` is already deterministically mocked and advancing the timers is the correct pattern. Replacing it with a synchronous call can falsely mask asynchronous bugs.
**Action:** Always verify if `vi.useFakeTimers()` is active before modifying `setTimeout` patterns. Do not convert async assertions to sync to avoid flakiness; instead, advance the fake system clock.

## 2026-05-20 - Vanity Coverage Guardrail
**Learning:** Automatically bumping vitest branch coverage thresholds beyond 80% (e.g. from 95% to 96%) violates the core constraint against chasing "100% coverage vanity metrics".
**Action:** Check global coverage thresholds in `vitest.config.js` before writing tests. If thresholds are already >= 80%, do not intentionally write trivial edge-case tests solely to ratchet the threshold up. Focus on logic gaps instead.

## 2026-05-20 - Brittle Generic DOM Assertions
**Learning:** Asserting on native DOM creation methods like `documentMock.createDocumentFragment()` without verifying where those fragments end up creates falsely passing tests that don't verify underlying behavior.
**Action:** Replace generic native DOM spy assertions with behavioral assertions, such as verifying `.appendChild()` on the specific target element.
## 2024-05-25 - Mocking Mapbox Proxy Methods
**Learning:** In Map-related unit tests (e.g., `WeatherRadar`), the component infers a Mapbox map instance (versus Leaflet) by checking `!this.map.hasLayer`. To test Mapbox-specific logic correctly, mock map objects must explicitly omit the `hasLayer` function. The proxy object returned by `createMapboxLayer` has its own simulated `on`/`off` events and a `redraw` mechanism manipulating Mapbox specific `addSource`/`setTiles` that need dedicated test blocks since they diverge significantly from Leaflet's standard `TileLayer`.
**Action:** Created dedicated test block for Mapbox proxy methods by passing a mocked map omitting `hasLayer` and explicitly simulated `mockMap.once` callbacks to trigger the registered proxy load events.
## 2024-05-25 - Fixing synchronous test callback violation
**Learning:** Fixing a "flaky" `setTimeout` test by removing it entirely and calling a mocked callback synchronously violates the requirement to preserve asynchronous testing intent.
**Action:** When fixing async event handlers (like `on('load', ...)`), retain the `setTimeout` simulation if `vi.useFakeTimers()` is active, and ensure `vi.advanceTimersByTime` is correctly paired with `await promise` to assert the final state.
