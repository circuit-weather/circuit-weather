# Palette's Journal

## 2026-01-22 - Smooth Theme Toggle
**Learning:** Users often perceive `display: none` theme switches as jarring or "broken" because the lack of transition breaks the visual continuity of the interface.
**Action:** When implementing binary state toggles (like theme or play/pause), always prefer opacity/transform transitions over direct DOM removal, but respect `prefers-reduced-motion`.
