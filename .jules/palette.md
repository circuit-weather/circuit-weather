## 2024-05-22 - Skip Link Implementation
**Learning:** While the "no custom CSS" rule is important for design system consistency, fundamental accessibility features like "Skip to Content" links require specific positioning and visual behavior (visible only on focus) that may not exist in standard utility classes.
**Action:** Treat accessibility utility classes (like `.skip-link`) as necessary infrastructure rather than "custom design," and ensure they reuse existing design tokens (colors, spacing) to blend in.
## 2026-02-19 - Domain-Specific Weather Metrics
**Learning:** For F1 racing, generic weather icons (like 'Cloudy') are insufficient; precise Precipitation Probability (Rain %) is critical for strategy. Users prefer explicit percentage over vague icons.
**Action:** Always include actionable metrics (Rain %, Wind Speed) in primary widgets for specialized domains, using consistent color coding (Blue for Rain).

## 2026-02-20 - Empty State for Selection Flows
**Learning:** When a user action (selecting a round) clears a dependent selection (session), leaving a blank space where the result (forecast) usually appears causes confusion.
**Action:** Always provide a descriptive empty state that guides the user to the next required action ("Select a session...").

## 2026-02-23 - ARIA Redundancy in Weather Widgets
**Learning:** Dynamic `aria-label` updates that duplicate visible content (e.g., "Temperature: 20°C" when "20°C" is visible inside a group named "Temperature") cause verbose, stuttering announcements in screen readers.
**Action:** Prefer static `aria-label` on grouping containers and let the inner content speak for itself, unless the content is purely visual/icon-based.

## 2026-02-23 - Status Indicators in Selection Dropdowns
**Learning:** For time-sensitive selections (like race schedules), simple text labels are insufficient. Users need to quickly identify "Live" or "Next" items without mentally parsing dates.
**Action:** Enhance dropdown options with clear, emoji-based status indicators ("🔴 LIVE", "(Next)") to reduce cognitive load and guide selection.

## 2026-02-23 - [Mobile Sidebar Accessibility]
**Learning:** CSS `transform` on mobile navigation menus hides content visually but leaves it focusable for keyboard users, trapping them in invisible UI.
**Action:** Pair `transform` transitions with `visibility: hidden` (using a transition delay) to remove off-screen elements from the accessibility tree, and implement a focus trap when open.

## 2026-02-24 - Focus Trap Resilience
**Learning:** JS-based focus traps often rely on `querySelectorAll` which returns hidden elements (e.g., inside `display: none` containers). If such an element is at the start/end of the trap boundary, the trap breaks because the browser won't focus it, causing `document.activeElement` to mismatch the expected boundary.
**Action:** Always filter focusable candidates by checking `offsetParent !== null` to ensure the trap loop only considers interactive elements.
