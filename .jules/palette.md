## 2024-05-22 - Skip Link Implementation
**Learning:** While the "no custom CSS" rule is important for design system consistency, fundamental accessibility features like "Skip to Content" links require specific positioning and visual behavior (visible only on focus) that may not exist in standard utility classes.
**Action:** Treat accessibility utility classes (like `.skip-link`) as necessary infrastructure rather than "custom design," and ensure they reuse existing design tokens (colors, spacing) to blend in.
## 2026-02-19 - Domain-Specific Weather Metrics
**Learning:** For F1 racing, generic weather icons (like 'Cloudy') are insufficient; precise Precipitation Probability (Rain %) is critical for strategy. Users prefer explicit percentage over vague icons.
**Action:** Always include actionable metrics (Rain %, Wind Speed) in primary widgets for specialized domains, using consistent color coding (Blue for Rain).

## 2026-02-20 - Empty State for Selection Flows
**Learning:** When a user action (selecting a round) clears a dependent selection (session), leaving a blank space where the result (forecast) usually appears causes confusion.
**Action:** Always provide a descriptive empty state that guides the user to the next required action ("Select a session...").
