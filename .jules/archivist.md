# Archivist Journal

2025-01-29 - Product Claim Drift: RainViewer Free Tier
Issue: README.md claimed "30-minute forecast" while AGENTS.md correctly noted "Historical Only" due to free tier API changes.
Cause: Feature removal in upstream API (RainViewer) was not reflected in user-facing documentation.
Fix: Updated README.md to remove the forecast claim.
Prevention: Verify feature claims against current API capabilities during major updates.

2025-01-29 - Agent Operations: Overwriting History
Issue: Initialized a new journal file potentially overwriting existing content without checking.
Cause: Assumed file did not exist based on root directory listing.
Fix: (Self-correction) Always check for existence before writing new files.
Prevention: Use `list_files` on subdirectories or `read_file` before creating/writing.

2026-01-28 - Privacy Policy Inaccuracy: Unpkg Usage
Issue: PRIVACY.md claimed Leaflet assets were loaded directly from Unpkg, while the codebase (worker.js) proxied them for strict CSP compliance.
Cause: Documentation drift after implementing strict Content Security Policy (CSP) and asset proxying.
Fix: Updated PRIVACY.md to correctly list Leaflet as a proxied data source.
Prevention: Review PRIVACY.md when modifying CSP or external asset loading strategies.
