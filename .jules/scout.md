## 2025-03-31 - Semantic description lists require corresponding unit test updates
**Learning:** Upgrading generic `<div>` and `<span>` wrappers to semantic `<dl>`, `<dt>`, `<dd>` elements for SEO and accessibility can break brittle Vitest `.innerHTML` assertions that hardcode the expected tags (like `</span>` or `</div>`).
**Action:** When modifying frontend HTML tags, always `grep` for the affected element IDs (e.g., `#weatherTemp`) in the `tests/` directory to update corresponding `.innerHTML` string assertions and prevent CI test regressions.
