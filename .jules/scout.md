## 2025-02-14 - Project Structure Limitation
**Learning:** This project lacks a root `package.json`, which prevents standard dependency management and testing workflows (e.g., `npm test`, `npm lint`). This makes automated verification challenging.
**Action:** Rely on manual verification and custom scripts where possible, or suggest adding a root `package.json` if the project scales.

## 2025-02-27 - Mobile H1 Restoration
**Learning:** Previous optimization (removing secondary H1) inadvertently removed the ONLY visible H1 on mobile, as the sidebar is hidden.
**Action:** Restored H1 on mobile header to ensure heading hierarchy is maintained across all viewports.

## 2025-02-28 - ARIA Landmark Linkage
**Learning:** When upgrading structural elements (like `<section>`) that contain a heading (e.g., `<h2>`) into semantic landmarks, replacing a hardcoded `aria-label` with `aria-labelledby` creates a more robust linkage. However, modifying existing well-understood labels (e.g., changing "Session Countdown" to point to an inner heading saying "Starts in") can degrade clarity for screen reader users.
**Action:** Always verify that the targeted heading's text provides equivalent or superior descriptive context compared to the original `aria-label` before converting to `aria-labelledby`.
