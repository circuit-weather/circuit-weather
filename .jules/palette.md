## 2024-05-22 - Skip Link Implementation
**Learning:** While the "no custom CSS" rule is important for design system consistency, fundamental accessibility features like "Skip to Content" links require specific positioning and visual behavior (visible only on focus) that may not exist in standard utility classes.
**Action:** Treat accessibility utility classes (like `.skip-link`) as necessary infrastructure rather than "custom design," and ensure they reuse existing design tokens (colors, spacing) to blend in.

## 2026-02-28 - Skip Link Incompatibility
**Learning:** This project is a single-page application without lengthy, repetitive navigation that precedes main content. Because there is no content to "skip from" or "skip to" in this layout, a "Skip to Content" link is unnecessary and explicitly unwanted.
**Action:** Do not implement "Skip to Content" links in this project. Focus accessibility efforts on interactive elements within the existing single-page layout (like focus traps and ARIA states).

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

## 2025-03-02 - Dropdown Status Indicators
**Learning:** Dropdown menus often hide critical context (like "Is this happening now?"). Adding status indicators directly to the option label significantly improves decision-making speed.
**Action:** For time-sensitive lists, always pre-calculate and append status indicators (LIVE, NEXT) to the visible label, rather than relying on external badges that might be missed.

## 2026-03-06 - Interactive Regions and Accessible Grouping
**Learning:** When creating widgets like Map controls or scrollable containers (like `PrivacyModal`), native keyboard users and screen reader users cannot explore their contents directly unless those containers have `tabindex="0"`. Additionally, creating an overarching descriptive `aria-label` and `role="region"` for parents prevents the stuttering caused by over-labeled children while maintaining total discoverability.
**Action:** Always apply `tabindex="0"` and `role="region"` to custom widgets and scrollable containers to establish them as interactive semantic landmarks, while letting the inner content speak for itself.

## 2024-05-18 - Redundant ARIA Attributes
**Learning:** Native HTML form controls like `<select>` automatically communicate their `disabled` state semantically to screen readers via the native `disabled` attribute. Adding `aria-disabled="true"` to these elements is redundant, provides no extra accessibility benefit, and violates the "First Rule of ARIA" (which favors using native semantic HTML over ARIA).
**Action:** Do not implement explicit `aria-disabled` logic for native form controls that already use the `disabled` boolean attribute.

## 2024-05-25 - Async Modal Loading States
**Learning:** When modals fetch content asynchronously (like privacy policies or terms) before opening, the UI appears frozen to the user after they click the trigger button.
**Action:** Always open the modal immediately and display a skeleton loading state inside the modal body while the asynchronous content is being fetched, providing instant interaction feedback.

## 2024-05-20 - Adding immediate feedback to synchronous page reloads
**Learning:** When a UI action triggers a synchronous `window.location.reload()`, the browser can appear to freeze for a moment before the navigation occurs. Adding immediate visual feedback (disabling the button, changing text to "Retrying...", updating `aria-label`) right before the reload significantly improves perceived performance and reassures the user that their action was registered, especially on slower network connections.
**Action:** Always add intermediate loading states to buttons that trigger full page navigations or reloads, rather than relying solely on the browser's native loading indicator.

## 2024-05-24 - Semantic Landmark Headings
**Learning:** When a `<section>` semantic landmark has an internal heading (like an `<h2>`), applying a static `aria-label` creates redundancy and often less descriptive context for screen reader users than the dynamic heading itself.
**Action:** Always use `aria-labelledby="[heading-id]"` to tie the structural landmark directly to its internal heading, especially when the heading text updates dynamically (e.g., changing to the name of a newly selected race).

## 2026-03-07 - Anchors with role="button" require explicit Spacebar handling
**Learning:** When using anchor `<a>` tags functioning as buttons with `role="button"`, native browsers only trigger the `click` event on the Enter key, not the Spacebar key. If a user presses Spacebar while focused on an anchor tag, it will result in the default page scroll down behavior, causing frustration and trapping keyboard users.
**Action:** Always bind an explicit `keydown` event listener to anchors with `role="button"` that catches `e.key === ' ' || e.key === 'Spacebar'`, prevents default browser scrolling, and manually executes the expected click action.

## 2026-03-08 - Mocking offsetParent for Focus Trap Tests
**Learning:** When testing focus traps in Vitest, mock DOM elements (like those created by `createMockElement`) must include an `offsetParent` property to prevent false failures when component logic correctly filters out hidden elements via `el.offsetParent !== null`.
**Action:** Always ensure that dynamically created mock HTML elements in test utilities include basic layout properties like `offsetParent: {}` to accurately simulate visible DOM nodes during interaction testing.
## 2026-03-09 - Continuous Animations in Skeleton Loaders
**Learning:** Continuous CSS animations (like infinite gradients on skeleton loaders) can cause discomfort, dizziness, or adverse effects for users with vestibular disorders or motion sensitivity who have enabled `prefers-reduced-motion` in their OS or browser.
**Action:** Always wrap continuous animations in a `@media (prefers-reduced-motion: reduce)` query to disable the animation (`animation: none`) and provide a static placeholder, ensuring the UI remains accessible and comfortable for all users.

## 2025-05-15 - Async Operation Silent Failures
**Learning:** When async operations tied to user interactions fail silently inside catch blocks, users are left staring at infinite loading skeletons or unchanged screens, which is confusing and feels broken.
**Action:** Always provide explicit visual feedback (like an error toast) and properly tear down loading states (e.g., removing `aria-busy` and hiding skeletons) in the catch block of user-initiated async functions.

## 2026-03-20 - Tactile Active States on Icon Buttons
**Learning:** While focus and hover states provide visual feedback for mouse and keyboard users, pure icon buttons can feel "dead" during the physical click event itself. Adding a subtle, fast scale-down effect (`transform: scale(0.95); transition: transform 0.1s ease;`) on the `:active` pseudo-class provides immediate, tactile visual feedback that makes the UI feel significantly more responsive and polished.
**Action:** Always consider adding subtle `:active` scale states to primary interactive elements, especially icon-only buttons, to enhance the perceived performance and physical feel of the application.

## 2026-03-24 - Async Loading States Before Synchronous Page Reloads
**Learning:** Even when a UI action triggers a seemingly immediate synchronous `window.location.reload()`, the browser can appear to freeze or stall before the actual navigation or repaint occurs, especially on slower network connections. Adding immediate visual feedback (such as disabling the button and injecting a loading spinner) right before the reload significantly improves perceived performance and reassures the user that their action was registered.
**Action:** Always add intermediate visual loading states (spinners, disabled attributes, and updated `aria-label`s) to action buttons that trigger full page navigations or reloads, rather than relying solely on the browser's native tab loading indicator.
