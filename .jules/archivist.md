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

## 2026-03-04 - Omitted major feature in Core Features

**Learning:** `AGENTS.md` omitted "Weather Forecast" (Open-Meteo) from its "Core Features" section and "Testing Checklist", even though the feature was fully implemented, documented in `PRIVACY.md` and `README.md`, and is a primary value proposition of the app.
**Action:** Added the "Weather Forecast" feature and its verification step to `AGENTS.md` to ensure a single source of truth for application capabilities and testing requirements.

## 2026-03-05 - Incomplete Worker API Route Documentation

**Learning:** The docstring at the top of `src/worker.js` only listed `/api/f1/*` as the handled route, despite the worker expanding to proxy multiple other services (e.g., `/api/health`, `/api/radar`, `/api/tiles/*`, `/api/track/*`, `/api/assets/*`) for caching and CSP compliance. This caused ambiguity for developers reading the entry point.
**Action:** Updated the `src/worker.js` header docstring to list all actively handled API proxy routes to match the actual `fetch` handler implementation.

## 2026-03-08 - Target Audience for Documentation

**Learning:** Human developers are not the target audience for `README.md` local development instructions; this project is explicitly meant for AI agents to build and run.
**Action:** Removed generic local setup steps from `README.md` and explicitly annotated `AGENTS.md` to reflect that the repository is agent-driven and does not target human contributors.

## 2026-03-09 - Undocumented Health Check Cache Duration

**Learning:** `AGENTS.md` listed the `/api/health` endpoint but omitted its 60-second edge cache duration, which is crucial for understanding its DDOS protection strategy as implemented in `src/worker.js`.
**Action:** Updated `AGENTS.md` to explicitly document the 60-second caching for the `/api/health` endpoint.

## 2026-03-11 - Node.js Runner Upgrade

**Learning:** GitHub Actions deprecated Node 20 runners, requiring an upgrade to Node 24 for the CI environment. Documentation must be kept in sync with the CI configuration to ensure developer environment consistency.
**Action:** Updated `.github/workflows/ci.yml` to use Node 24.x and updated `AGENTS.md` to recommend Node 24+ for local development.

## 2026-03-12 - Legacy Cloudflare Pages References

**Learning:** The project migrated to Cloudflare Workers with Static Assets, but PRIVACY.md and AGENTS.md file tree still incorrectly referenced Cloudflare Pages.
**Action:** Removed mentions of Cloudflare Pages to accurately reflect the single-worker architecture.

## 2026-03-13 - Standardizing Local Dev Runner Command

**Learning:** `AGENTS.md` local development instructions incorrectly suggested using `npx wrangler dev` alongside a commented-out `# pnpm run dev` fallback. While standardizing on `pnpm run dev` ensures exact version matching with CI, developers may not have `pnpm` available, or may have `wrangler` installed globally. Documenting a single standard path without explaining _why_ or providing fallbacks for varying environments creates friction for contributors.
**Action:** Updated `AGENTS.md` to explicitly state `pnpm run dev` as the standard (for CI parity), while actively documenting `wrangler dev` (for global installs) and `npx wrangler dev` (for dynamic fetching) as explicitly reasoned fallbacks.

## 2026-03-14 - Privacy Proxy Drift for Proxied Assets

**Learning:** `PRIVACY.md` documented the "Privacy Proxy" strategy for F1 schedules, Track Layouts, and RainViewer tiles, but failed to mention that Leaflet library assets fetched from Unpkg are also proxied. Documentation of privacy architectures must be kept strictly in sync with actual implementation details (like those found in `src/worker.js`) to ensure users have accurate information about what data is obscured.
**Action:** Updated `PRIVACY.md` to explicitly include Leaflet library assets in the list of resources protected by the Cloudflare Worker proxy.

## 2026-03-24 - Legacy Cloudflare Pages Reference in .gitignore

**Learning:** Despite the project migrating to Cloudflare Workers with Static Assets, an outdated comment referencing Cloudflare Pages remained in `.gitignore`.
**Action:** Updated `.gitignore` comment to correctly describe `wrangler.toml`'s role in Cloudflare Workers deployment to maintain accuracy.

## 2026-03-29 - Rate Limiter Scope Clarification

**Learning:** `AGENTS.md` documented the Rate Limiter as "1000 req/min", which was ambiguously worded and failed to specify that the limit applies _per IP_ and _per isolate_. The implementation in `src/worker.js` instantiates the `RateLimiter` per isolate and keys by `CF-Connecting-IP`.
**Action:** Updated `AGENTS.md` to explicitly state the limit is "1000 req/min per IP per isolate" to avoid confusion about global vs individual limits.

## 2026-03-30 - Privacy Policy Drift for Local Storage Keys

**Learning:** When adding new features like Internationalization (i18n) that persist user preferences (e.g., the `language` key via `SafeStorage`), the `PRIVACY.md` documentation detailing local storage usage often drifts from the actual implementation.
**Action:** Always verify `PRIVACY.md` when introducing new client-side storage keys to ensure transparency about data residing on the user's device.

## 2025-04-04 - Documenting Mapbox Integration and Environment Configuration

**Learning:** The project migrated to use Mapbox GL JS as the primary map renderer (falling back to Leaflet.js with Carto), but the `README.md` and `AGENTS.md` files still primarily referenced Leaflet and Carto and omitted the `MAPBOX_ACCESS_TOKEN` environment variable.
**Action:** Updated documentation in `README.md` and `AGENTS.md` to accurately reflect the primary use of Mapbox and document the `MAPBOX_ACCESS_TOKEN`.

## 2026-04-05 - Privacy Policy Drift for Third-Party Mapping APIs

**Learning:** When the project migrated to use Mapbox GL JS as the primary map renderer, `PRIVACY.md` drifted and omitted Mapbox entirely from both the "Mapping & Assets" direct connections list and the "Data Sources (Proxied)" list, despite CSP headers (`_headers`) and `worker.js` actively demonstrating these new data flows (`api.mapbox.com` and proxied `mapbox-gl.js`).
**Action:** Always cross-reference changes to Content Security Policy (CSP) rules (`_headers`) and Cloudflare Worker proxy routes (`worker.js`) with `PRIVACY.md` to ensure any new third-party services and data flows are transparently documented.

## 2026-04-06 - Local Storage Documentation Drift: Cached Application Data

**Learning:** When using `SafeStorage` (or `localStorage`) not just for simple preference flags (like theme/unit) but also for caching application data (such as `f1_schedule_cache`), the documentation in `PRIVACY.md` often drifts. Developers tend to remember to document user-facing settings but forget internal data caches.
**Action:** When auditing or updating `PRIVACY.md` regarding local storage, always grep for all usages of `SafeStorage` and `localStorage` across the entire codebase to ensure both preference flags and internal data caches are fully and transparently documented.

## 2026-04-07 - Undocumented API Endpoints

**Learning:** Internal endpoints like `/api/config` were implemented but missing from `AGENTS.md` and `src/worker.js` headers, leading to an incomplete API documentation.
**Action:** When adding or modifying routes in `src/worker.js`, always update the API Endpoints table in `AGENTS.md` and the docstring in `src/worker.js`.

## 2026-04-09 - Architecture Documentation Drift

**Learning:** When core infrastructure components (like the primary map renderer or proxy endpoints) change, documentation in files like `AGENTS.md` and `README.md` often drift and fail to reflect the new architecture accurately (e.g., omitting Mapbox CDN from the proxied services list).
**Action:** Always cross-reference architecture claims in documentation with the actual implementation (like `src/worker.js` and `_headers`) to ensure accuracy.

## 2026-04-10 - Architecture Documentation Drift for Leaflet Assets

**Learning:** While `worker.js` and `PRIVACY.md` explicitly documented that `Mapbox CDN` for `Mapbox GL JS assets` was being proxied to enforce strict Content Security Policy (CSP), the overarching `README.md` file had drifted and failed to list `Mapbox CDN` alongside `Unpkg` in the "How it works" section.
**Action:** Always cross-reference the `README.md` list of proxied services with `worker.js` (specifically the `VENDOR_ASSETS` block) and `PRIVACY.md` to ensure architectural claims are exhaustive.

## 2026-04-14 - Omitted major feature in Core Features

**Learning:** `AGENTS.md` omitted "Language Toggle" from its "Core Features" section, even though the feature is fully implemented, documented in `PRIVACY.md`, and is an active feature.
**Action:** Added the "Language Toggle" feature to `AGENTS.md` to ensure a single source of truth for application capabilities.

## 2026-04-25 - Fixing Privacy Policy Drift across Localized Versions\n**Learning:** When updating to reflect new local storage keys (like `language` and `f1_schedule_cache`), it's crucial to also update all localized versions in `public/privacy/` to maintain consistency and compliance. Python or JS scripts can be used to safely append new items while matching surrounding formatting.\n**Action:** Always write a script or manually ensure that any modifications to the root `PRIVACY.md` list of local storage items are faithfully replicated across all `public/privacy/PRIVACY.*.md` variants.

## 2026-04-25 - Fixing Privacy Policy Drift across Localized Versions

**Learning:** When updating `PRIVACY.md` to reflect new local storage keys (like `language` and `f1_schedule_cache`), it's crucial to also update all localized versions in `public/privacy/` to maintain consistency and compliance. Scripts can be used to safely append new items while matching surrounding formatting.
**Action:** Always write a script or manually ensure that any modifications to the root `PRIVACY.md` list of local storage items are faithfully replicated across all `public/privacy/PRIVACY.*.md` variants.

## 2026-04-28 - Regex Limitations and Formatting When Injecting Legal Text

**Learning:** When using Node.js scripts to inject text into markdown files (like `PRIVACY.*.md`), using template literals with indentation can inadvertently inject whitespace, breaking markdown formatting by converting text into code blocks. Also, relying on complex `RegExp` for trailing lines with various localized characters can fail (e.g., throwing `SyntaxError: Invalid regular expression... Nothing to repeat`) if the regex string is not properly escaped for all possible localized punctuation.
**Action:** Always left-align script contents and template literals in heredocs (e.g., `cat << 'EOF' > script.cjs`). Use exact string replacements or highly simplified regexes (like `targetAfter: 'Leaflet'`) to bypass character encoding and regex escaping errors in localized files.

## 2024-05-09 - Missing Caching Durations in Privacy Policy

**Learning:** The privacy policy only documented caching durations for one out of five proxied data sources, leaving the data retention times for the others ambiguous despite them being explicitly defined in the worker cache headers.
**Action:** Always verify that documentation of data retention and caching covers all relevant services consistently.

## 2026-05-25 - Documenting Wind Overlay Preference Storage

**Learning:** When introducing new UI toggles that persist state via `SafeStorage` (like the `windOverlay` feature), the documentation in `PRIVACY.md` and its localized variants often drifts, omitting the new storage key. Developers must ensure all user-facing preferences are documented to maintain privacy transparency.
**Action:** When adding or modifying `SafeStorage` keys, always grep across the entire codebase and update the Local Storage section in `public/PRIVACY.md` and all `public/privacy/PRIVACY.*.md` variants.

## 2026-06-01 - Omitted major feature in Core Features

**Learning:** `AGENTS.md` omitted "Wind Overlay" from its "Core Features" section, even though the feature is fully implemented, documented in `PRIVACY.md`, and is an active feature that persists user preference in `localStorage`.
**Action:** Added the "Wind Overlay" feature to `AGENTS.md` to ensure a single source of truth for application capabilities.

## 2026-06-02 - Documentation Drift for Proxied Assets in API Endpoints Table

**Learning:** While `src/worker.js` and `PRIVACY.md` correctly identified that `VENDOR_ASSETS` (handling `/api/assets/*`) proxies both Unpkg and Mapbox CDNs, the "API Endpoints" table in `AGENTS.md` was slightly ambiguous and didn't mention Unpkg or CDNs explicitly.
**Action:** Updated the "API Endpoints" table in `AGENTS.md` to explicitly state that `/api/assets/*` proxies to Unpkg (Leaflet) and Mapbox CDNs for map library assets, maintaining alignment with `worker.js` and `PRIVACY.md`.

## 2026-06-02 - Unpkg and Mapbox CDN Proxy Drift

**Learning:** When updating API endpoint documentation, it is critical to reflect exact details from the worker file (e.g., `VENDOR_ASSETS`) such as which specific CDNs (like Unpkg or Mapbox CDNs) are proxied by a wildcard endpoint like `/api/assets/*`. Generic descriptions can mislead human or automated analysis about the architecture.
**Action:** When updating proxy endpoint documentation in `AGENTS.md`, always cross-reference the exact configurations in `src/worker.js` (like `VENDOR_ASSETS`) and list the actual upstream domains/services involved.

## 2026-06-02 - Documentation Drift for Local Storage Cache Durations

**Learning:** While the keys for `localStorage` and `SafeStorage` (like `f1_schedule_cache`) were documented in `PRIVACY.md`, the _duration_ of the cache (e.g. 7 days vs 24 hours) had drifted from the actual implementation in the codebase (`CACHE_DURATION_MS`). Developers update constants in code but forget to update the corresponding privacy policy entries.
**Action:** Always cross-reference the documented cache durations in `PRIVACY.md` against their actual TTL/expiry constants in the source code (e.g. `src/worker.js` or `public/src/api/*.js`).

## 2026-06-03 - Edge Cache TTL Drift

**Learning:** When edge caching configuration (`Cache-Control: max-age`) is updated in Cloudflare Worker code (e.g., in `src/worker.js`), the corresponding documentation for the cache TTL (such as in `AGENTS.md` and `PRIVACY.md`) frequently drifts. Developers often update the implementation but forget to synchronize the publicly documented retention claims.
**Action:** Whenever a `max-age` value is modified or reviewed in the edge worker logic, always search for the service name (e.g., "Jolpica F1", "track layout") in `AGENTS.md` and `PRIVACY.md` to ensure the documented cache duration is strictly accurate and reflects the code's reality.

## 2026-06-07 - Fixing Third-Party Data Source Omission

**Learning:** `AGENTS.md` omitted "OpenF1" from its "Third-Party Services" table, even though it is used as a fallback data source for F1 schedules. It must be documented that OpenF1 is accessed directly (Client-side) because it blocks requests from datacenter IP ranges (Cloudflare Workers).
**Action:** Added the "OpenF1" data source to the `AGENTS.md` Third-Party Services table to ensure architectural claims are exhaustive.

## 2026-06-08 - Drift in Privacy Proxy list in PRIVACY.md

**Learning:** While the 'Data Sources (Proxied)' section of `PRIVACY.md` accurately documented that both Leaflet and Mapbox GL JS assets are proxied through the Cloudflare worker, the 'Privacy Proxy' bullet point in the 'Infrastructure & Caching' section had drifted and only mentioned Leaflet library assets. This inconsistency created ambiguity about whether Mapbox assets are also proxied for privacy reasons.
**Action:** Always cross-reference the components listed in the 'Privacy Proxy' infrastructure summary with the detailed breakdown in the 'Data Sources (Proxied)' section to ensure all proxied third-party assets (like Mapbox GL JS) are accurately represented in both places across all localized privacy policies.

## 2026-06-25 - Drift in Localized Privacy Policies

**Learning:** When core infrastructure components change, such as adding Mapbox CDN to the proxied data sources list in `public/PRIVACY.md`, the English root file often gets updated with statements like "(proxied for security...)", but developers forget to apply the corresponding translation to the identical asset (Leaflet) in all localized privacy policies (`public/privacy/PRIVACY.*.md`). This results in privacy policy drift across different languages.
**Action:** When updating or reviewing `public/PRIVACY.md` for infrastructure changes, ensure that both `Leaflet` and `Mapbox` asset descriptions reflect the same translated "proxied for security" verbiage across all localized files.
