## 2024-05-24 - Initialization Error State
**Learning:** The application had no visual feedback for initialization failures (API downtime), leaving users with a broken UI.
**Action:** Implemented a reusable `.error-state` pattern that replaces sidebar content with a friendly error message and retry action. This pattern can be reused for other critical failures.

## 2025-01-28 - Loading State Accessibility
**Learning:** Screen readers may announce empty containers or nothing at all when content is being fetched, leading to confusion.
**Action:** Use `aria-busy="true"` on the container and `aria-hidden="true"` on the skeleton loader to communicate state without noise.

## 2025-01-28 - Semantic Lists for Timelines
**Learning:** Using `<div>` soup for lists of items (like a forecast timeline) forces screen reader users to navigate blindly.
**Action:** Use semantic `<ul>` and `<li>` structures for any list of repeating items. Remove default styling with CSS to maintain the design while improving navigability.

## 2025-05-21 - Share Button Rejection
**Learning:** User explicitly rejected an explicit "Share" button in the header, preferring a strictly immersive, app-like interface without social/sharing clutter.
**Action:** Avoid adding dedicated share UI elements. Rely on browser native URL copying and document "Deep Linking" capabilities instead of building "Share" features.
