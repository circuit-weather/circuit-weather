## 2026-01-01 - Testing Recursive Polling with Vitest
**Learning:** Testing methods that recursively call themselves via `setTimeout` (like `WeatherRadar.scheduleNextPoll`) creates a tricky spying scenario. If you spy on the method *before* the first manual call, you might double-count invocations or interfere with the initial setup.
**Action:** The robust pattern is: 1. Mock dependencies (timers, fetch). 2. Call the method manually (Call #1). 3. *Then* spy on the method. 4. Advance timers to trigger the recursive call (Call #2). 5. Assert the spy was called once (verifying the recursion). This isolates the recursive behavior from the initial trigger.

## 2026-10-24 - Manual Date.now Mocking vs Fake Timers
**Learning:** Found legacy tests manually overriding `global.Date.now` for time-dependent logic. This is brittle and can leak into other tests or interfere with libraries relying on real time.
**Action:** Always prefer `vi.useFakeTimers()` and `vi.setSystemTime()`/`vi.advanceTimersByTime()` for robust, isolated time manipulation in tests.
