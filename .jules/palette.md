## 2026-01-26 - External Links Accessibility
**Learning:** External links often lack visual or audible indicators, causing confusion when new tabs open unexpectedly.
**Action:** Always include an external link icon and screen-reader-only text "(opens in a new tab)" for `target="_blank"` links.

## 2026-01-27 - Dynamic Action Labels vs. ARIA Pressed
**Learning:** For toggle buttons representing an action (like Play/Pause), dynamic labels (e.g., "Play", "Pause") are clearer than static labels with `aria-pressed` state. This aligns with the "Theme Toggle" pattern.
**Action:** Use dynamic `aria-label` and `title` attributes for binary action toggles instead of `aria-pressed`.
