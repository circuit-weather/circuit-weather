## 2025-03-31 - Semantic description lists require corresponding unit test updates

**Learning:** Upgrading generic `<div>` and `<span>` wrappers to semantic `<dl>`, `<dt>`, `<dd>` elements for SEO and accessibility can break brittle Vitest `.innerHTML` assertions that hardcode the expected tags (like `</span>` or `</div>`).
**Action:** When modifying frontend HTML tags, always `grep` for the affected element IDs (e.g., `#weatherTemp`) in the `tests/` directory to update corresponding `.innerHTML` string assertions and prevent CI test regressions.
## 2025-02-14 - SportsEvent Schema Description Optimization
**Learning:** Adding the `description` property to the dynamically injected `SportsEvent` JSON-LD schema (via `CircuitWeatherApp.js`) requires correctly reusing an existing localized description variable (`desc`) which is defined early in the `updatePageMetadata` method and interpolated using `i18n.t()`.
**Action:** When injecting or expanding dynamic JSON-LD schemas in `updatePageMetadata`, carefully inspect the local variable scope (using tools like `sed` or `grep`) to reuse existing computed context strings (like `desc`, `title`, etc.) for metadata, ensuring rich SERP displays without duplicating localization logic or causing `ReferenceError`s.
