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

2026-02-23 - Missing Attribution in README
Issue: README.md Credits section omitted Open-Meteo and bacinger/f1-circuits, despite their usage being core to the functionality and required by license/good practice.
Cause: Documentation lagged behind feature implementation (forecasts and track data).
Fix: Added Open-Meteo and bacinger/f1-circuits to the Credits section in README.md.
Prevention: Audit data sources and licenses when adding new features or dependencies.

2025-05-15 - [SEO] Reduced H1 tag count to one
Issue: Multiple H1 tags (sidebar and mobile header) were present on the page, which is suboptimal for SEO.
Cause: The design used H1 tags for the site title in both the desktop sidebar and the mobile top bar.
Fix: Converted the mobile header H1 to a span with class 'header-title' and updated CSS to maintain styling.
Prevention: Ensure that only the primary desktop sidebar title uses H1, and other instances of the site title use non-heading elements or classes.

2026-02-24 - Inaccurate RainViewer Limits & File Structure
Issue: Documentation claimed RainViewer limit was zoom 10, but code enforces zoom 7 based on Jan 2026 findings. File structure missed sitemap.xml.
Cause: Documentation drift after API changes/findings were implemented in code but not fully updated in high-level docs.
Fix: Updated AGENTS.md zoom limit to 7 and added sitemap.xml to file tree.
Prevention: Check code comments (especially recent ones) when verifying documentation claims.

2026-02-24 - Inconsistent Version Numbering and Redundant Metadata
Issue: Project version was inconsistent across files (package.json: 1.0.0, worker.js: 1.1.1). Additionally, redundant JSON-LD structured data existed in both index.html (static, outdated) and main.js (dynamic).
Cause: Manual version bump in worker code without updating package metadata. Redundant JSON-LD likely due to migration to dynamic injection for CSP compliance without removing the static block.
Fix: Updated package.json to 1.1.1, added softwareVersion to dynamic JSON-LD in main.js, and removed static JSON-LD from index.html.
Prevention: Verify all version sources (package.json, worker.js, metadata) during release. Audit index.html for redundant metadata when using dynamic injection.

2026-02-25 - Documentation Enhancement: Node Version Prerequisite
Issue: AGENTS.md did not specify the required Node.js version, leading to potential environment mismatches with CI (v20+).
Cause: Incomplete prerequisite documentation.
Fix: Updated AGENTS.md to explicitly recommend Node.js v20+ for local development.
Prevention: Verify local development instructions match CI configuration.

2026-02-25 - Feature Flag Drift: enableCurrentWeather
Issue: The `enableCurrentWeather` flag in `config.js` was documented as disabled but set to `true`, and the application code did not actually respect the flag (hardcoded enabled).
Cause: Code implementation lagged behind configuration intent, leading to a zombie feature flag.
Fix: Implemented logic in `CircuitWeatherApp.js` to respect `FEATURE_FLAGS.enableCurrentWeather`, and updated the configuration comment to reflect the enabled state while preserving the warning about rate limits.
Prevention: Verify that new configuration flags are actually consumed by the application logic during code review.

2026-02-25 - Feature Flag Removal: enableCurrentWeather
Issue: The `enableCurrentWeather` flag was removed entirely after code review request to just keep the feature enabled.
Cause: Code review feedback indicated that the flag was unnecessary and the feature should be permanently enabled.
Fix: Removed `FEATURE_FLAGS` from `public/src/config.js` and removed conditional checks in `public/src/CircuitWeatherApp.js`.
Prevention: Revisit feature flags periodically to remove those that are no longer needed (e.g., permanently enabled features).

2026-02-27 - Undocumented Test Coverage Thresholds
Issue: vitest.config.js enforces strict coverage thresholds (Lines: 87.14%, etc.) which are not documented in AGENTS.md, causing CI failures for unaware contributors.
Cause: CI configuration (vitest.config.js) was updated without reflecting changes in developer documentation.
Fix: Documented the specific thresholds and the verification command in AGENTS.md.
Prevention: Review vitest.config.js when updating testing documentation.

2026-02-28 - Test Coverage Threshold Drift
Issue: The actual test coverage thresholds in `vitest.config.js` were stricter (Statements: 92.36%, Branches: 92.71%, Functions: 96.12%, Lines: 92.36%) than those documented in `AGENTS.md` (Statements: 87.14%, etc.).
Cause: `vitest.config.js` was updated to enforce higher quality standards, but the documentation was not updated to reflect this change.
Fix: Removed explicit thresholds from `AGENTS.md` in favor of referencing `vitest.config.js` as the single source of truth.
Prevention: Avoid duplicating configuration values in documentation; reference the config file instead.

## 2026-03-01 - Phantom Package Manager Instructions

**Learning:** `AGENTS.md` contained multiple `npm` commands (`npm install`, `npm test`, etc.) despite the project memory indicating the use of `pnpm` (evidenced by `pnpm-lock.yaml`). Additionally, the documentation claimed `vitest` only tested "the Worker logic," whereas `vitest.config.js` explicitly includes `public/src/**/*.js` (frontend components).
**Action:** Updated all `npm` references to `pnpm` in `AGENTS.md` and corrected the scope of `vitest` to include frontend components to match the test runner configuration.

## 2026-03-02 - CI Pipeline Package Manager Drift

**Learning:** The project strictly uses `pnpm` (configured via `pnpm-lock.yaml` and documented in `AGENTS.md`), but the automated CI workflow (`.github/workflows/ci.yml`) was still using `npm ci` and `npm run test:coverage`. This caused a discrepancy between local test environments and the CI pipeline.
**Action:** Updated `ci.yml` to use `pnpm/action-setup@v4` with `pnpm install --frozen-lockfile` to ensure exact matching behavior between local development and CI execution.

## 2026-03-03 - Incomplete Proxied Services in README

**Learning:** `README.md` claimed "All API requests (Jolpica F1, RainViewer) are proxied" but omitted GitHub (track data) and Unpkg (Leaflet assets), which were later proxied for CSP compliance and privacy.
**Action:** Always cross-reference `README.md` architecture claims with `worker.js` and `PRIVACY.md` when asset or data fetching strategies evolve.
