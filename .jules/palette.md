## 2024-05-21 - Improving Radar Slider Accessibility
**Learning:** `input[type="range"]` announces raw numeric values by default, which is meaningless for timeline sliders representing time.
**Action:** Use `aria-valuetext` to provide human-readable values (e.g., "14:30") for time-based sliders.
