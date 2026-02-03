## 2025-02-18 - Skip Link Rejected
**Learning:** The "Skip to main content" link pattern, while standard for accessibility, was explicitly rejected for this project. This suggests a preference for a strictly "app-like" interface without traditional web navigation aids that might disrupt the visual immersion or map interaction.
**Action:** Do not implement "Skip to main content" links or similar overlay navigation anchors. Focus on semantic HTML and keyboard shortcuts instead.

## 2025-02-18 - Share Button Rejected
**Learning:** The user explicitly rejected the addition of a "Share" button to the race info banner. This indicates a preference against cluttering the UI with sharing utilities, possibly because the URL is already easily shareable or the focus should remain strictly on weather/race data.
**Action:** **STRICT DIRECTIVE**: Do NOT implement a 'Share' button or any social sharing functionality in the project interface. This is a persistent prohibition that overrides standard feature patterns.

## 2025-02-18 - Semantic Labels on Toggles
**Learning:** Changing a toggle button's `aria-label` to match its active state (e.g., "Close sidebar" instead of "Toggle sidebar") was rejected as semantically incorrect. This highlights the importance of keeping labels generic for dual-state controls to avoid confusion or state mismatch.
**Action:** Use neutral verbs like "Toggle" or static nouns for `aria-label` on dual-state buttons, relying on `aria-expanded` to communicate state.

## 2025-02-18 - Hidden Functionality Discovery
**Learning:** 'Escape' key functionality for closing modals existed in the code but was completely invisible to users. This "hidden utility" pattern is an anti-pattern.
**Action:** Always verify if keyboard logic exists before implementing it, and ensure existing shortcuts are advertised via tooltips (`title`) or `aria-keyshortcuts`.
# Palette's Journal

## 2026-01-22 - Smooth Theme Toggle
**Learning:** Users often perceive `display: none` theme switches as jarring or "broken" because the lack of transition breaks the visual continuity of the interface.
**Action:** When implementing binary state toggles (like theme or play/pause), always prefer opacity/transform transitions over direct DOM removal, but respect `prefers-reduced-motion`.

## 2026-01-23 - Morphing Icon Transitions
**Learning:** Stacking icons using CSS Grid (`grid-area: 1 / 1`) provides a much more stable layout for morphing animations than absolute positioning, which often collapses the parent container's height.
**Action:** Use this pattern for all icon-replacement animations (like play/pause, menu/close) to maintain layout stability while enabling smooth scale/rotate transitions.

## 2026-01-24 - Vanilla JS Modal Focus Management
**Learning:** The application uses custom vanilla JS classes for modals (like `PrivacyModal`) which lack native focus trapping features provided by libraries or the `<dialog>` element.
**Action:** When implementing or modifying overlays/modals in this codebase, manual `keydown` event listeners must be added to trap Tab focus cycles, as the browser does not handle this automatically for `div`-based modals.

## 2026-02-21 - Actionable Empty States
**Learning:** Generic empty states like "Forecast available closer to session" provide insufficient guidance when the user selects a distant future event, potentially causing confusion about whether the feature is broken.
**Action:** When data is unavailable due to time constraints, provide specific, actionable information (e.g., "Forecast available from [Date]") to manage user expectations effectively.

## 2024-05-24 - Map Accessibility: Clutter in Tab Order
**Learning:** Leaflet markers and overlays are interactive by default (`interactive: true`), making them focusable tab stops even when purely decorative or informational (like distance labels). This clutters the keyboard navigation sequence for map users.
**Action:** Always set `{ interactive: false, keyboard: false }` for map overlays that are visual-only to ensure they don't block map panning or create unnecessary tab stops.
