## 2025-02-14 - Project Structure Limitation
**Learning:** This project lacks a root `package.json`, which prevents standard dependency management and testing workflows (e.g., `npm test`, `npm lint`). This makes automated verification challenging.
**Action:** Rely on manual verification and custom scripts where possible, or suggest adding a root `package.json` if the project scales.

## 2025-02-27 - Mobile H1 Restoration
**Learning:** Previous optimization (removing secondary H1) inadvertently removed the ONLY visible H1 on mobile, as the sidebar is hidden.
**Action:** Restored H1 on mobile header to ensure heading hierarchy is maintained across all viewports.
