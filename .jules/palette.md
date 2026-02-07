## 2024-05-24 - Initialization Error State
**Learning:** The application had no visual feedback for initialization failures (API downtime), leaving users with a broken UI.
**Action:** Implemented a reusable `.error-state` pattern that replaces sidebar content with a friendly error message and retry action. This pattern can be reused for other critical failures.

## 2025-01-28 - Loading State Accessibility
**Learning:** Screen readers may announce empty containers or nothing at all when content is being fetched, leading to confusion.
**Action:** Use `aria-busy="true"` on the container and `aria-hidden="true"` on the skeleton loader to communicate state without noise.

## 2025-01-28 - Improving Long Dropdowns with Optgroups
**Learning:** For long <select> lists (like a 24-race schedule), using <optgroup> provides immediate semantic structure and improves scannability without complex custom UI.
**Action:** Always check if long select lists can be logically grouped (e.g., by month, category, or region) to reduce cognitive load.
