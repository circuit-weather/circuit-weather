## 2026-02-18 - RateLimiter LRU Eviction Fix
**Vulnerability:** The in-memory `RateLimiter` class in `src/worker.js` used a `Map` to store IP records but failed to update the insertion order when accessing existing keys. This resulted in FIFO eviction instead of the intended LRU behavior, potentially allowing active users to be evicted prematurely during high traffic or attacks.
**Learning:** JavaScript `Map` objects preserve key insertion order. Updating a value associated with an existing key using `set()` does *not* change its position in the iteration order. To implement true LRU behavior, one must explicitly `delete()` the key and then `set()` it again to move it to the end of the Map.
**Prevention:** When implementing LRU caches using `Map` in JavaScript, always ensure that access operations (`get` or `set` updates) include a delete-then-set sequence to refresh the key's position.

## 2025-05-21 - External API Data Injection Risk
**Vulnerability:** `CircuitWeatherApp.renderForecast` injected weather unit strings from the Open-Meteo API directly into the DOM using `innerHTML` without sanitization. While the API is trusted, this created a potential XSS vector if the API response was compromised or spoofed.
**Learning:** Even trusted third-party APIs should be treated as untrusted sources when rendering data into the DOM. Always sanitize or escape any external data before injecting it via `innerHTML`.
**Prevention:** Use `textContent` where possible, or strictly escape all dynamic values when building HTML strings.

## 2026-02-20 - Worker Proxy SRI Verification
**Vulnerability:** The Cloudflare Worker proxied external Leaflet assets from `unpkg.com` without verifying their integrity. While the frontend enforced SRI via `integrity` attributes, a compromised upstream file would still be fetched and cached by the worker, causing a Denial of Service for all users as browsers blocked the mismatched resource.
**Learning:** When building a reverse proxy for external assets, frontend-only SRI is insufficient as it protects the client but poisons the edge cache. The proxy itself must verify the integrity of the upstream response before caching it.
**Prevention:** Implement server-side SRI verification in the proxy layer by buffering the response, calculating its SHA-256 hash, and comparing it against a strict allowlist before committing to cache or serving.

## 2026-02-21 - Tile Proxy Upstream Leakage
**Vulnerability:** The `handleTileRequest` in `src/worker.js` piped raw upstream response bodies (potentially HTML error pages) to the client with `Content-Type: application/json` for non-cacheable errors (429, 5xx). This could leak upstream implementation details or internal IP addresses from error pages.
**Learning:** Always sanitize upstream error responses in a proxy. Even if the client expects an image, returning a structured JSON error is safer than passing through raw HTML content which might be misinterpreted or leak information.
**Prevention:** Consume the upstream response body for error statuses and return a clean, generated JSON response with only necessary headers (like `Retry-After`).

## 2026-02-21 - Tile Proxy HTML Injection via 404
**Vulnerability:** The `handleTileRequest` in `src/worker.js` proxied upstream 404 responses from `rainviewer.com` regardless of content type. The upstream returned `text/html` error pages, which the worker cached and served. This allowed Reflected/Stored XSS if a user was tricked into visiting a non-existent tile URL, as the browser would render the HTML in the application's origin.
**Learning:** API proxies must never assume the upstream response matches the requested file extension or content type, especially for error codes. Browsers may sniff or respect `Content-Type: text/html` even on `.png` URLs.
**Prevention:** Strictly validate `Content-Type` for all proxied responses, including errors (404). If the upstream returns HTML for an image request, intercept and replace it with a safe response (JSON or generated image).

## 2026-02-23 - Hotlink Protection Weakness & Cloudflare Pages Scope
**Vulnerability:** The `checkRequestSource` function allowed requests with *missing* `Origin`/`Referer` headers, enabling scripts to bypass hotlink protection. Additionally, the `ALLOWED_PREVIEW_REGEX` was overly permissive (`*.pages.dev`), inadvertently trusting any site on the shared Cloudflare Pages platform.
**Learning:** Hotlink protection based solely on `Origin` and `Referer` headers is insufficient for non-browser clients (scripts) which can simply omit them. Furthermore, in shared hosting environments (like Cloudflare Pages or Vercel), wildcard domain whitelisting (`*.provider.com`) grants excessive trust to other tenants.
**Prevention:**
1. Require at least one identity header (`Origin`, `Referer`, or `Sec-Fetch-Site`) to be present; block requests that have none.
2. Strictly scope domain regexes to the specific project name or subdomain, avoiding broad wildcards on shared platforms.

## 2026-02-24 - Worker Origin Validation Bypass
**Vulnerability:** The `ALLOWED_WORKER_REGEX` in `src/worker.js` used a permissive wildcard (`*.workers.dev`), allowing any Cloudflare Worker deployed by any user to bypass hotlink protection and proxy requests to the API. This undermined the access controls intended to restrict API usage to the official application.
**Learning:** Wildcard allowlists for shared domains (like `workers.dev`, `herokuapp.com`, `s3.amazonaws.com`) are dangerous because they treat all tenants of the platform as trusted.
**Prevention:** Always restrict allowlists to specific subdomains or patterns that include the project's unique identifier (e.g., `project-name.*.workers.dev`) to ensure only trusted instances are authorized.

## 2026-06-15 - Unsafe HTML Attribute Injection in Vanilla JS Templates
**Vulnerability:** The `renderForecast` method in `CircuitWeatherApp.js` correctly escaped text content but failed to escape dynamic values injected into HTML attributes (e.g., `title="${dir}"`, `aria-label="..."`). This allowed XSS via attribute breakout if the variable contained double quotes.
**Learning:** Template literals make it easy to overlook attribute context. Escaping for text content (e.g., `<element>${var}</element>`) handles `<` and `&`, but attribute values (e.g., `attr="${var}"`) require escaping `"` to prevent breakout.
**Prevention:** Consistently apply `escapeHtml` to ALL variables interpolated into HTML strings, regardless of context (content or attribute).

## 2026-06-16 - RateLimiter Memory Exhaustion via OldGen Migration
**Vulnerability:** The `RateLimiter` class in `src/worker-utils.js` allowed indefinite memory growth when migrating records from `oldGen` to `currentGen`. It checked `maxIps` only when creating *new* records, but failed to enforce the limit when reviving existing records from the previous generation. An attacker could exploit this by rotating IPs between generations to exceed the intended memory cap.
**Learning:** LRU caches with generational eviction must enforce capacity limits on *all* write operations, including internal migrations between generations, not just on initial insertion.
**Prevention:** Always check `size >= capacity` before any `set()` operation on the active cache, regardless of the source of the data (new vs migrated).

## 2026-06-21 - Loose Regex in Worker Origin Validation
**Vulnerability:** The `ALLOWED_WORKER_REGEX` used to validate Cloudflare Worker origins was overly permissive (`circuit-weather.*`), allowing attackers to bypass hotlink protection by deploying workers with names that started with the target project's name (e.g., `circuit-weather-attack.attacker.workers.dev`).
**Learning:** Regex wildcards like `.*` are dangerous when validating domains because they match any character, including hyphens that separate script names from prefixes/suffixes. A partial match on a script name (e.g., matching a prefix) without anchoring or boundary checks allows adversaries to extend the name.
**Prevention:** When validating subdomains or script names, always enforce strict boundaries using literal dots (`\.`) or end-of-string anchors. Avoid greedy wildcards; use specific character classes (e.g., `[a-zA-Z0-9-]+`) to match only valid domain characters.

## 2026-06-22 - Regex Validation for Dev Builds
**Vulnerability:** When tightening regex validation for Worker origins, it is easy to inadvertently block legitimate development or preview build formats (e.g., `038ad3cf-circuit-weather.user.workers.dev`).
**Learning:** Always verify regex changes against all known environment URL patterns, including dynamic preview builds which may have random hash prefixes.
**Prevention:** Include examples of all environment URL formats in the test suite to ensure the regex is both secure (blocks attackers) and functional (allows dev builds).

## 2026-06-25 - Loose Content-Type Validation in Worker Proxy
**Vulnerability:** The Worker Proxy validated `Content-Type` headers using partial substring matches (e.g., `.includes('application/json')`). This allowed deceptive MIME types like `application/jsonp` (executable JSONP) or `text/javascript-malicious` to bypass security checks, potentially enabling cache poisoning or XSS via MIME confusion.
**Learning:** Using `includes()` or `startsWith()` for MIME type validation is insufficient as it matches malicious subtypes or extensions that share the same prefix/substring.
**Prevention:** Always parse the `Content-Type` header (splitting by `;` to remove parameters) and perform a strict equality check against the allowed MIME type (e.g., `mime === 'application/json'`).

## 2026-06-30 - Regex for Shared Domains (workers.dev)
**Vulnerability:** The `ALLOWED_WORKER_REGEX` was too broad, allowing any Cloudflare user to deploy a worker with the script name `circuit-weather` and bypass hotlink protection. Relying on regexes for shared domains like `workers.dev` is inherently risky as it's difficult to restrict the tenant (subdomain) without blocking legitimate preview builds.
**Learning:** For self-hosted or preview environments on shared domains, regex validation of the Origin header is often insufficient or overly complex. A strictly enforced "Same-Origin" check (`origin === request.url.origin`) is a more robust and secure pattern.
**Prevention:** Replace regex allowlists with a dynamic Same-Origin check for supporting self-hosted instances. This automatically trusts the current deployment domain while blocking external domains, without needing complex pattern matching.

## 2024-05-31 - [High] Regex Spoofing Vulnerability in Preview URL Validation
**Vulnerability:** The CORS and Hotlink Protection in `src/worker-utils.js` used a vulnerable regex `^https:\/\/(.*\.)?circuit-weather\.pages\.dev(\/|$)` to validate Cloudflare Pages preview environments. The `(.*\.)?` group matched greedily and allowed attackers to prepend their own domains (e.g., `https://attacker.com/foo.circuit-weather.pages.dev/`), completely bypassing origin checks.
**Learning:** Wildcards like `.*` in origin-matching regular expressions are inherently dangerous and prone to prefix/suffix spoofing attacks, especially when validating dynamic environments like `.workers.dev` or `.pages.dev`.
**Prevention:** Always restrict subdomains to valid characters (e.g., `[a-zA-Z0-9-]+`) rather than using greedy matchers. Use `(?:[a-zA-Z0-9-]+\.)*` to safely validate multiple subdomains.

## 2026-07-07 - XSS in CircuitWeatherApp Forecast Wind Information
**Vulnerability:** `CircuitWeatherApp.renderForecast` injected `windInfo.text` and `rotation` values directly into the DOM using `innerHTML` without sanitization inside an SVG attribute (`transform: rotate(...)`) and span `aria-label`s. This created a potential XSS vector if the `weatherClient.getWindDirection()` method returned untrusted or compromised data.
**Learning:** Even data computed from internal utility functions should be treated as potentially unsafe when injected into HTML strings, particularly when placed directly into element attributes (like `aria-label` or `style`).
**Prevention:** Consistently apply `escapeHtml` to ALL dynamically passed parameters in DOM-injecting methods, even if the current callers appear to pass safe or hardcoded values.

## 2026-06-30 - HTML Entity Bypass in URL Sanitization
**Vulnerability:** The `sanitizeUrl` function in `PrivacyModal.js` used a regular expression to validate the protocol scheme (`/^[a-z][a-z0-9+.-]*:/i`) and block dangerous ones like `javascript:`. However, it failed to account for HTML entity encoding in the input. Because the markdown parser called `escapeHtml()` prior to this check, an attacker could provide `[click](javascript&colon;alert(1))` which was encoded to `javascript&amp;colon;alert(1)`. The regex failed to match the `&` or the scheme, passing it through as a "safe" relative URL. When injected into the DOM via `innerHTML`, the browser decoded the entities back to `javascript:alert(1)`, allowing XSS execution upon clicking.
**Learning:** URL sanitization must occur on the fully decoded string that the browser will eventually parse. Browsers decode HTML entities in attributes like `href` *before* evaluating the URL scheme. Validating an encoded string allows attackers to hide malicious schemes (like `javascript:`) behind entities.
**Prevention:** When sanitizing URLs for DOM injection, use a robust parser (like `DOMParser`) to decode all HTML entities in the string *before* applying regex scheme validation, ensuring the filter evaluates the exact string the browser will execute.
## 2026-07-06 - XSS in Error Render
**Vulnerability:** The `renderError` method in `CircuitWeatherApp.js` accepted an arbitrary string for its `message` parameter and injected it directly into the DOM using `innerHTML` without sanitization. Although it was currently called with static strings, this was an XSS vector if any dynamically generated errors (e.g. from network logs or parsed API responses) were passed into it.
**Learning:** Any UI method that injects parameters into the DOM via `innerHTML` must treat those parameters as potentially untrusted.
**Prevention:** Consistently apply `escapeHtml` to ALL dynamically passed parameters in DOM-injecting methods, even if the current callers appear to pass safe or hardcoded values.
## 2026-07-08 - XSS Attribute Breakout via URL Sanitization Decoding
**Vulnerability:** The `sanitizeUrl` function in `PrivacyModal.js` correctly decoded HTML entities using `DOMParser` to evaluate the URL scheme for XSS payloads (like `javascript:`). However, it returned the *decoded* string directly into the template literal for the `href` attribute without re-escaping it. This allowed an attacker to break out of the `href` attribute by passing an encoded quote (e.g. `[link](https://example.com/&quot;onmouseover=&quot;alert(1))`), which the sanitizer decoded to a raw quote and injected directly into the DOM via `innerHTML`.
**Learning:** URL sanitizers that decode strings for security inspection must ensure the final output is safe for the context where it will be used. Returning a decoded, unescaped string into an HTML attribute context creates an attribute breakout XSS vulnerability.
**Prevention:** Always apply `escapeHtml` (or equivalent context-specific escaping) to the final string returned by a sanitization function before it is injected into the DOM, even if the scheme itself is safe.

## 2024-05-31 - Reverse Tabnabbing in Map Attribution Links
**Vulnerability:** The `MapManager.js` component rendered external attribution links (CARTO, OSM) without `target="_blank"` or `rel="noopener noreferrer"`. Clicking them navigated users away from the app. Adding `target="_blank"` without `rel="noopener noreferrer"` would create a reverse tabnabbing vector where the new tab could maliciously redirect the origin page via the `window.opener` reference.
**Learning:** Any external links rendered dynamically by JavaScript components must explicitly include `rel="noopener noreferrer"` if they open in a new tab (`target="_blank"`), even if they point to reputable sites, to ensure defense in depth against compromised third parties.
**Prevention:** Always pair `target="_blank"` with `rel="noopener noreferrer"` for external links across all UI components and map controls.
