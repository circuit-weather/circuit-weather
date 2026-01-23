# Palette's Journal

## 2026-01-22 - Smooth Theme Toggle
**Learning:** Users often perceive `display: none` theme switches as jarring or "broken" because the lack of transition breaks the visual continuity of the interface.
**Action:** When implementing binary state toggles (like theme or play/pause), always prefer opacity/transform transitions over direct DOM removal, but respect `prefers-reduced-motion`.

## 2026-01-23 - Morphing Icon Transitions
**Learning:** Stacking icons using CSS Grid (`grid-area: 1 / 1`) provides a much more stable layout for morphing animations than absolute positioning, which often collapses the parent container's height.
**Action:** Use this pattern for all icon-replacement animations (like play/pause, menu/close) to maintain layout stability while enabling smooth scale/rotate transitions.
