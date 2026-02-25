## 2026-01-01 - Testing Recursive Polling with Vitest
**Learning:** Testing methods that recursively call themselves via `setTimeout` (like `WeatherRadar.scheduleNextPoll`) creates a tricky spying scenario. If you spy on the method *before* the first manual call, you might double-count invocations or interfere with the initial setup.
**Action:** The robust pattern is: 1. Mock dependencies (timers, fetch). 2. Call the method manually (Call #1). 3. *Then* spy on the method. 4. Advance timers to trigger the recursive call (Call #2). 5. Assert the spy was called once (verifying the recursion). This isolates the recursive behavior from the initial trigger.

## 2026-10-24 - Manual Date.now Mocking vs Fake Timers
**Learning:** Found legacy tests manually overriding `global.Date.now` for time-dependent logic. This is brittle and can leak into other tests or interfere with libraries relying on real time.
**Action:** Always prefer `vi.useFakeTimers()` and `vi.setSystemTime()`/`vi.advanceTimersByTime()` for robust, isolated time manipulation in tests.

## 2026-10-26 - Testing DOM Reuse Logic
**Learning:** When testing performance optimizations that rely on object reuse (like `reconcileLayers`), standard state assertions aren't enough. You must verify *identity preservation* (the object in the new state is the exact same instance as the old state) and *explicit cleanup* of unused objects to catch memory leaks.
**Action:** Create mock objects before the operation, pass them into the initial state, and assert that the *same* mock objects exist in the final state. Verify `removeLayer` (or equivalent cleanup method) is called for objects that should be discarded.

## 2026-05-22 - Testing DOM-Dependent Logic in Node Environment
**Learning:** Testing frontend classes (like `ThemeManager`) that rely on browser globals (`window`, `document`, `localStorage`) in a Node-based test runner (Vitest) requires comprehensive global stubbing. Partial mocking of `window` (e.g., just `matchMedia`) can be sufficient if the code accesses other globals directly.
**Action:** Use `vi.stubGlobal` to mock `document`, `window`, and `localStorage`. Ensure `document.documentElement` and event listeners are mocked to simulate browser behavior without a full DOM implementation (like jsdom) if the logic is simple enough.
