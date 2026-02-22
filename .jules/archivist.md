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

2026-02-18 - Incorrect File Path Documentation
Issue: AGENTS.md referenced `src/config.js` as the location for feature flags, but the file is located at `public/src/config.js`.
Cause: Documentation error or file relocation without updating documentation.
Fix: Updated AGENTS.md to point to the correct path `public/src/config.js`.
Prevention: Verify file paths in documentation against the actual file system.

2026-02-22 - RainViewer Cache Duration Inaccuracy
Issue: Documentation claimed "RainViewer: Weather radar tiles and metadata (2-hour edge cache)" in both AGENTS.md and PRIVACY.md.
Cause: Likely a simplification during documentation writing that conflated tile cache (2h) with metadata cache (1m).
Fix: Updated both files to explicitly distinguish between tile cache (2h) and metadata cache (1m).
Prevention: Verify cache control headers in src/worker.js against documentation claims during updates.

2026-02-23 - Tone Shift in README
Issue: The README.md used first-person ("I", "we") and informal language ("vibe coded"), which did not align with the desired neutral, product-focused tone.
Cause: The initial documentation reflected the personal nature of the project's creation rather than the end product itself.
Fix: Rewrote the introduction and technical sections of README.md to use third-person perspective ("the website", "it") and passive voice where appropriate.
Prevention: Maintain a consistent, objective tone in documentation updates, focusing on the software's functionality rather than the development process.

2026-02-23 - Reversion of 'Vibe Coded' Tone
Issue: The previous update to README.md removed a specific "unashamedly vibe coded" phrase that the user explicitly wanted to keep.
Cause: Over-correction towards objective tone without considering author's specific voice requirements.
Fix: Restored the specific sentence while keeping the surrounding context in third-person, and mandated New Zealand English in AGENTS.md.
Prevention: When refactoring tone, verify if specific stylized phrases should be preserved as part of the product identity.
