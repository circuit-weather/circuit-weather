## 2025-03-31 - Semantic description lists require corresponding unit test updates

**Learning:** Upgrading generic `<div>` and `<span>` wrappers to semantic `<dl>`, `<dt>`, `<dd>` elements for SEO and accessibility can break brittle Vitest `.innerHTML` assertions that hardcode the expected tags (like `</span>` or `</div>`).
**Action:** When modifying frontend HTML tags, always `grep` for the affected element IDs (e.g., `#weatherTemp`) in the `tests/` directory to update corresponding `.innerHTML` string assertions and prevent CI test regressions.

## 2025-02-14 - SportsEvent Schema Description Optimization

**Learning:** Adding the `description` property to the dynamically injected `SportsEvent` JSON-LD schema (via `CircuitWeatherApp.js`) requires correctly reusing an existing localized description variable (`desc`) which is defined early in the `updatePageMetadata` method and interpolated using `i18n.t()`.
**Action:** When injecting or expanding dynamic JSON-LD schemas in `updatePageMetadata`, carefully inspect the local variable scope (using tools like `sed` or `grep`) to reuse existing computed context strings (like `desc`, `title`, etc.) for metadata, ensuring rich SERP displays without duplicating localization logic or causing `ReferenceError`s.

## 2025-04-01 - Managing multiple H1s across distinct DOM sections

**Learning:** The `public/index.html` file employs separate DOM structures for desktop sidebars (`<aside class="sidebar">`), mobile headers (`<header class="mobile-header">`), and crawler fallbacks (`<noscript>`). When optimizing semantic HTML or heading hierarchies for SEO, carefully orchestrate updates across these distinct sections to avoid accidentally introducing duplicate root-level tags (like multiple `<h1>` elements) that could confuse search engines.
**Action:** When modifying heading hierarchies for fallback or mobile content, always verify the global document context to maintain a strict, hierarchical outline (e.g., cascading from `<h2>` down) if an `<h1>` is already structurally necessary elsewhere in the SPA shell.

## 2025-04-24 - Role="button" on native anchors

**Learning:** Memory explicitly states that native `<a href="...">` anchor tags should not use `role="button"` as it overrides their semantic identity, causing crawlers to treat them as widgets rather than navigational paths.
**Action:** Always scan for and remove `role="button"` from native `<a>` tags with `href` attributes, but ensure existing CSS classes (like `.link-button`) are retained so visual layout remains completely unaffected.

## 2025-04-26 - max-image-preview SEO directive

**Learning:** Adding the `<meta name="robots" content="max-image-preview:large">` directive is a highly effective, invisible SEO optimization that enables Google Discover and search results to use large, high-quality image previews, drastically improving Click-Through Rates (CTR).
**Action:** When acting as Scout, actively seek out opportunities to add or augment the `robots` meta tag with `max-image-preview:large`, `max-snippet:-1`, and `max-video-preview:-1` on content-heavy pages.
## 2025-05-01 - Cloudflare API Workers Cannot Do Edge HTML SEO Rewrites

**Learning:** The application uses Cloudflare Pages/Workers (`wrangler.toml`) where `src/worker.js` is configured to only intercept API routes (`run_worker_first = ["/api/*"]`). It cannot be used for Edge HTML rewriting (e.g., dynamically injecting specific Open Graph meta tags for Facebook crawlers) because the main SPA HTML is served directly as a static asset.
**Action:** When attempting to improve static metadata that requires crawler visibility without executing JS (like `og:image`), do not attempt to write Edge handlers in `src/worker.js`.
## 2025-05-02 - Semantic Tags and Default Browser Margins

**Learning:** Upgrading generic HTML containers (`<div>`, `<span>`) to semantic text tags (like `<p>`) for better SEO document outline introduces default browser user-agent styles (specifically, block-level display and top/bottom margins). This can unexpectedly break the visual layout if the elements were originally designed without margins.
**Action:** When replacing generic wrappers with semantic text tags, always inspect the corresponding CSS selectors and explicitly add CSS resets (e.g., `margin: 0`) to prevent visual regressions while maintaining semantic value for crawlers.
