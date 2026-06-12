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
## 2025-05-02 - Upgrading DOM elements requires test updates

**Learning:** Upgrading generic root container tags (like changing `document.createElement('div')` to `'section'`) for better semantic meaning directly breaks rigid Vitest spies, such as `expect(document.createElement).toHaveBeenCalledWith('div')`.
**Action:** When upgrading or modifying the root HTML tags of UI components, always `grep` for and update corresponding strict DOM creation assertions in the Vitest test files to prevent test suite regressions.
## 2025-05-10 - Semantic Tags for Third-Party Widgets

**Learning:** Replacing generic wrapper `<div>` elements around third-party scripts (like "Buy me a coffee" sponsorship buttons) with semantic `<aside>` elements explicitly signals to search engine crawlers that the content is secondary or tangentially related, properly pulling it out of the primary document outline without breaking the third-party widget's rendering.
**Action:** Always consider the structural implication of wrapper tags for external embeds. Use `<aside>` for sponsorships or ads, but ensure existing CSS class names (e.g., `.bmc-container`) are preserved exactly so visual styling remains intact.
## 2025-05-13 - Semantic grouping of titles and metadata

**Learning:** When a generic container `<div>` is used to group an `<h2>` (or any `h1-h6`) with contextual paragraphs (like subheadings or metadata, e.g., Country, Circuit Name), crawlers may parse them as disjointed elements. Upgrading the wrapper to an `<hgroup>` explicitly signals to search engines that the paragraphs function as subheadings for the primary heading entity.
**Action:** Always look for opportunities to upgrade `<div>` wrappers to `<hgroup>` when grouping headings with `<p>` tags, ensuring to apply `margin: 0` CSS resets since `<hgroup>` is a block-level element that may carry different browser default styles than a generic `div`.

## 2025-05-14 - Expanding JSON-LD WebApplication Schema with Publisher Entity
**Learning:** Expanding the existing `WebApplication` JSON-LD schema to explicitly include a `publisher` `Organization` entity (linking to the project repository via `sameAs`) is a highly effective, invisible SEO win. It establishes explicit brand identity and authoritativeness for Google Knowledge Graph integration.
**Action:** When acting as Scout, identify existing generic JSON-LD schemas and look for opportunities to nest organizational or author entities to provide search engines with richer semantic context.
## 2025-05-15 - Injecting Organizer into SportsEvent JSON-LD Schema

**Learning:** Enhancing the dynamic `SportsEvent` JSON-LD schema with an `organizer` entity explicitly links the localized event to a wider organization (e.g., Formula 1). Since this schema is dynamically constructed and injected as a JavaScript object before serialization in `CircuitWeatherApp.js`, any comments regarding its SEO value must be standard JavaScript comments (`//`), not HTML comments (`<!-- -->`), to avoid syntax errors before the string is injected into the DOM.
**Action:** When adding SEO documentation comments directly inside JavaScript files (including when building JSON objects for JSON-LD), always use JavaScript comments. Only use HTML comments when modifying actual `.html` template files.
## 2025-05-17 - Temporal Data and Duration Semantics

**Learning:** When displaying durations (such as countdown timers), replacing generic `<div>` wrappers with the semantic `<time>` tag enhances semantic precision for search engines mapping event timelines. However, simply wrapping the duration in `<time>` is insufficient; search engines expect a valid, machine-readable `datetime` attribute.
**Action:** When implementing a semantic `<time>` tag for durations, construct and inject a valid ISO 8601 duration string (e.g., `PT2H30M15S` or `P3DT5H`) into the `datetime` attribute. Ensure any corresponding test suites asserting DOM structures (e.g., `setAttribute` calls) are updated to reflect the new attribute injection logic.

## 2025-02-14 - Avoid Error States in Document Outline
**Learning:** Upgrading generic div wrappers in error toasts to `<hgroup>` and heading tags (`<h3>`) is an SEO anti-pattern. While technically semantic, injecting temporary error states into the permanent document hierarchy confuses crawlers about the actual content outline of the page.
**Action:** Do not optimize error states, toasts, or temporary UI elements with headings or outline-altering structural tags. Focus semantic upgrades on permanent page content.

## 2025-02-14 - Dialog Content Deprioritization
**Learning:** Upgrading `<div>` wrappers inside `<dialog>` modals to `<header>` and `<section>` tags is technically correct HTML5, but has negligible SEO impact because search engines deprioritize hidden modal content.
**Action:** Prioritize structural SEO improvements within the `<main>`, `<article>`, or core visible components of the page before optimizing hidden modal structures.
## 2025-02-14 - Semantic List Upgrades
**Learning:** Upgrading loosely grouped generic `<div>` wrappers into semantic HTML lists (`<dl>`, `<dt>`, `<dd>`) can break visual layout depending on global browser defaults and parent CSS rules for list elements, as they often introduce default margins/paddings.
**Action:** When converting elements to `<dl>` or `<dd>` for SEO/a11y improvements without changing stylesheets, immediately apply inline CSS resets (e.g., `margin: 0`, `padding: 0`, `display: flex`) to strictly preserve the visual design constraints mandated by the SEO prompt guidelines.

## 2025-05-24 - Semantic aside tags for secondary notices

**Learning:** Upgrading generic fallback warning messages (like a `data-source-notice` `<div>`) to semantic `<aside>` tags correctly signals to search engines that the warning is supplementary content and not part of the primary page outline, improving indexation of the core content.
**Action:** Always scan for persistent or fallback warning containers and replace generic `div`s with `<aside>`, taking care to ensure CSS continues to target class names (`.data-source-notice`) rather than the raw element tags so styling isn't broken.
