## 2024-05-21 - Improving Radar Slider Accessibility
**Learning:** `input[type="range"]` announces raw numeric values by default, which is meaningless for timeline sliders representing time.
**Action:** Use `aria-valuetext` to provide human-readable values (e.g., "14:30") for time-based sliders.

## 2025-01-26 - Privacy Modal Focus Management
**Learning:** Custom modal implementations require manual focus management to ensure accessibility for keyboard users.
**Action:** When opening a modal, save the trigger element and move focus to the modal (e.g., close button). When closing, restore focus to the trigger.
