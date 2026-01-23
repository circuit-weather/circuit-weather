# Bolt's Journal

## 2024-05-23 - Animation Loop Optimization
**Learning:** `setInterval` for animation loops is an anti-pattern even for low-framerate animations because it drifts and consumes CPU in background tabs.
**Action:** Use `requestAnimationFrame` with a time-delta check to handle variable framerates efficiently.

## 2026-01-23 - Filter Hourly Optimization
**Learning:** `reduce` + `map` chains on large, sorted datasets are significantly slower than a single `for` loop with early exit (benchmarked at ~5x improvement).
**Action:** When filtering sorted time-series data, prefer explicit loops with `break` conditions to minimize iterations.
