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
