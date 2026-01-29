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
