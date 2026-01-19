# Bolt's Journal

## 2024-05-23 - Animation Loop Optimization
**Learning:** `setInterval` for animation loops is an anti-pattern even for low-framerate animations because it drifts and consumes CPU in background tabs.
**Action:** Use `requestAnimationFrame` with a time-delta check to handle variable framerates efficiently.
