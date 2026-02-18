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

2026-01-29 - Inaccurate Third-Party Service Documentation
Issue: AGENTS.md listed "Auth Required" as "No" for Jolpica, while failing to mention it is proxied, and inconsistently used "Proxied" for RainViewer in the same column. It also missed GitHub (Tracks) and Open-Meteo in the Technology Stack overview.
Cause: Documentation drift as new services (GitHub tracks) and patterns (proxying for privacy) were adopted without updating the high-level agent guide.
Fix: Renamed "Auth Required" to "Connection" in AGENTS.md, updated values to "Proxied (Cached)" or "Direct (Client-side)", and added missing services (GitHub, Open-Meteo).
Prevention: Review AGENTS.md when adding new external dependencies or changing data fetching strategies.

2026-02-17 - Incomplete Third-Party Service List
Issue: AGENTS.md omitted Google Fonts, FlagCDN, and Buy Me a Coffee from the Third-Party Services table, creating a discrepancy with the codebase and PRIVACY.md.
Cause: Frontend assets and widgets added directly to HTML/JS were not reflected in the high-level architecture documentation.
Fix: Added missing services to AGENTS.md with "Direct (Client-side)" connection type.
Prevention: Audit index.html and app.js for external URLs when updating documentation or adding new features.

2026-02-17 - Missing Proxied Service in Documentation
Issue: AGENTS.md omitted Unpkg (Leaflet) from the Third-Party Services table, despite it being proxied and listed in PRIVACY.md.
Cause: Oversight when documenting proxied services vs direct services.
Fix: Added Unpkg (Leaflet) to AGENTS.md with "Proxied (Cached)" connection type.
Prevention: Cross-reference PRIVACY.md and src/worker.js when updating AGENTS.md.
