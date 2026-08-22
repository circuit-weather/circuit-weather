## 2024-05-24 - [CSP Fixes & Reliance on Inline Styles]

**Vulnerability:** Weak CSP 'style-src' directive allowing 'unsafe-inline'.
**Learning:** Removing 'unsafe-inline' from 'style-src' in `public/index.html` completely breaks the application because it relies heavily on inline styles for component hiding (`display: none`), skeleton loaders, and dynamic SVG element rotations (`CircuitWeatherApp.js`). Standard automated UI testing might give false negatives if it doesn't explicitly capture console errors or wait for dynamic rendering.
**Prevention:** Before hardening CSP rules that restrict inline styles or scripts, extensively grep the codebase for `style=` and dynamic `.style.` assignments, and write robust Playwright verifications that explicitly capture and assert against browser console errors containing "Content-Security-Policy".

## 2024-10-27 - [Upstream API MIME Sniffing & Cache Poisoning]

**Vulnerability:** Missing `Content-Type` validation on upstream API responses in Cloudflare Worker proxy endpoints (e.g., `handleTrackRequest`).
**Learning:** Even if an API endpoint (like GitHub Raw) is strictly validated against a regex and returns a 200 OK, the upstream source might serve an unexpected MIME type (e.g., HTML instead of JSON) due to server errors, misconfigurations, or attacks. If the worker proxy caches and forwards this response with `Content-Type: application/json` or `text/plain`, it creates a vector for MIME-sniffing vulnerabilities or cache poisoning for clients relying on the response format.
**Prevention:** All Cloudflare Worker proxy endpoints must strictly validate the `Content-Type` header of the upstream response (e.g., enforcing `application/json` or `text/plain`) before processing or caching the data. If the type is invalid, the proxy should return a 502 Bad Gateway response using `cacheAndReturnError`.

## 2025-05-24 - [Cache Busting DoS on /api/health]

**Vulnerability:** The `/api/health` endpoint used `request.url` directly as the cache key, allowing attackers to bypass the 60-second cache TTL by appending random query parameters (e.g., `?q=1`, `?q=2`). This could be used to mount a Denial of Service (DoS) attack against the upstream APIs.
**Learning:** Even when caching is implemented to protect upstream resources, using the raw request URL as the cache key can completely negate the protection if the endpoint doesn't strictly validate or ignore query parameters. Attackers can trivially generate unique cache keys for every request.
**Prevention:** Always normalize cache keys for API endpoints that don't depend on query parameters. Construct the cache key using only the origin and pathname (e.g., `new Request(new URL(request.url).origin + new URL(request.url).pathname)`) to ensure all variations of the URL map to the same cached response.

## 2025-05-25 - [Health Check Information Disclosure]

**Vulnerability:** The `/api/health` endpoint leaked internal environment configurations and error details to unauthenticated users based on the `env.ENVIRONMENT` variable.
**Learning:** Unauthenticated public endpoints should provide generic, opaque error statuses (e.g., simply 'unreachable') instead of conditionally exposing internal error messages or environment states, which can reveal infrastructure details or configuration environments to attackers.
**Prevention:** Always hardcode safe, generic failure states for public unauthenticated endpoints and restrict detailed error strings strictly to server-side logging mechanisms wrapped in environment checks.

## 2026-04-05 - [JSON-LD DOM-based XSS via JSON.stringify]

**Vulnerability:** Classic DOM-based XSS vulnerability through inline script tags containing JSON-LD (`<script type="application/ld+json">`). The code injected dynamic, unvalidated properties from the F1 API (e.g. `race.name`) into the DOM using `JSON.stringify(data)`. `JSON.stringify` does not escape forward slashes or angle brackets by default. An attacker controlling the API response could include a payload like `</script><script>alert(1)</script>` inside a JSON string. The browser's HTML parser closes the `<script>` tag upon encountering `</script>` and executes the subsequent malicious script payload.
**Learning:** Using `JSON.stringify` alone is insufficient for safely embedding user-provided or third-party data within inline `<script>` elements because it does not encode HTML control characters like `<` and `>`.
**Prevention:** Always sanitize JSON strings prior to injection into `<script>` tags by replacing problematic characters with their Unicode escapes (e.g., `.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')`) to ensure the browser's HTML parser remains within the JSON context.

## 2026-04-07 - [Missing Timeouts on Client-Side External API Calls]

**Vulnerability:** Several critical client-side API requests (`F1API.js`, `MapManager.js`, `PrivacyModal.js`) used the `fetch` API without a timeout. This is a DoS or resiliency risk where an unresponsive backend or proxy could cause the application to hang indefinitely, blocking the main thread from completing critical initialization or UI updates.
**Learning:** Even when the backend Cloudflare Worker has its own strict upstream timeouts configured, the client browser still needs local request timeouts because the network connection between the client and the worker proxy itself can stall or hang.
**Prevention:** Always include `signal: AbortSignal.timeout(duration)` on all client-side external `fetch` calls to ensure the application fails securely and gracefully.

## 2025-02-28 - Validate localStorage inputs against DOM attribute injection

**Vulnerability:** Application read the `theme` value directly from `localStorage` and injected it unconditionally into the `data-theme` attribute of the DOM root (`document.documentElement.setAttribute("data-theme", theme)`). While `setAttribute` inherently blocks traditional XSS, a malicious actor or cross-site scripting vulnerability could poison `localStorage`, injecting an unexpected attribute value that breaks the visual layout or sets up a CSS injection attack vector.
**Learning:** Even within an SPA where user inputs are generally escaped, values retrieved from local browser storage (which could be modified by other scripts on the same origin or physical access) must be treated as untrusted user input.
**Prevention:** Strictly validate `localStorage` values against expected enumerations (e.g., `"dark"` or `"light"`) before injecting them into the DOM.

## 2026-04-11 - [Validate localStorage inputs against unexpected application behavior via poisoned unit preference]

**Vulnerability:** Application read the `unit` value directly from `localStorage` (`SafeStorage.getItem('unit')`) and used it unconditionally. While not directly injecting into the DOM attributes like the previous theme vulnerability, treating local storage as fully trusted input can lead to application logic bypasses or unexpected behavior if a malicious actor or a cross-site scripting vulnerability poisons `localStorage`.
**Learning:** Even within an SPA where user inputs are generally escaped, values retrieved from local browser storage (which could be modified by other scripts on the same origin or physical access) must be treated as untrusted user input and verified for downstream use.
**Prevention:** Strictly validate `localStorage` values against expected enumerations (like `'metric'` or `'imperial'`) before using them in application logic to prevent unexpected behaviors.

## 2024-05-24 - [Validate localStorage inputs against DOM attribute injection via poisoned language preference]

**Vulnerability:** Application read the `language` value directly from `localStorage` (`SafeStorage.getItem('language')`) and passed it to the `normalise` function. If `Intl.Locale` threw an error for an invalid format, it would incorrectly fall back to the unvalidated raw input. This allowed a maliciously crafted value from `localStorage` to be injected into the `lang` attribute of `document.documentElement`.
**Learning:** Fallback mechanisms must not return raw, untrusted user input when validation fails, especially when the output is later injected directly into the DOM structure.
**Prevention:** Always fall back to a safe, known default value (like `'en-NZ'`) when validation (such as `Intl.Locale`) fails on data sourced from `localStorage`.
## 2025-05-26 - [Case-Sensitive MIME Type Parsing Vulnerability]
**Vulnerability:** The Cloudflare Worker proxy parsed the `Content-Type` header (e.g., `contentType.split(";")[0].trim()`) and performed strict equality checks against expected MIME types (e.g., `application/json`) without first converting the parsed string to lowercase.
**Learning:** HTTP headers are generally case-insensitive. An upstream server could validly send a `Content-Type` such as `Application/JSON`. Without converting the parsed MIME type to lowercase, a strict equality check (`!== "application/json"`) would incorrectly reject a valid upstream response, potentially causing application breakage or enabling an upstream attacker to force a fallback caching behavior.
**Prevention:** Always append `.toLowerCase()` when parsing and evaluating MIME types from HTTP headers prior to performing strict equality or inclusion checks against expected formats.
## 2024-05-24 - SSRF and Path Traversal via string.replace()
**Vulnerability:** Path Traversal / SSRF via `.replace('prefix', '')`
**Learning:** In `src/worker.js`, route parameters were extracted using `url.pathname.replace('/api/prefix', '')`. If an attacker requests `/api/prefix.evil.com/file`, `url.pathname` is `/api/prefix.evil.com/file`. The first instance of `/api/prefix` is replaced, resulting in `.evil.com/file`. When concatenated to an upstream URL like `https://upstream.com`, it becomes `https://upstream.com.evil.com/file`, creating an SSRF / Path Traversal vulnerability.
**Prevention:** When extracting route path parameters from URLs, always use `url.pathname.slice('prefix'.length)` instead of `url.pathname.replace('prefix', '')` to ensure strict prefix stripping.
## 2026-06-30 - [Remove innerHTML from MapWeatherWidget]
**Vulnerability:** The `MapWeatherWidget` constructed its entire DOM structure by assigning a template string with localized strings (`i18n.t(...)`) directly to `this._div.innerHTML`. If translation strings ever contained unescaped input, it could expose a DOM-based Cross-Site Scripting (XSS) vulnerability.
**Learning:** Even though translation files are currently static and controlled, relying on `innerHTML` combined with external string injection is a fragile security pattern. When replacing `innerHTML` with DOM methods like `document.createElement` and `document.createElementNS`, unit tests must be thoroughly updated because simple DOM mocks (like Vitest stubs) may lack complete implementations for methods like `appendChild` or `querySelector`, leading to false negative test failures.
**Prevention:** Construct UI widgets using standard DOM manipulation methods (`document.createElement`, `textContent`, `setAttribute`) by default to prevent XSS. When updating legacy `innerHTML` code, ensure the corresponding unit test mocks correctly simulate necessary DOM interactions.

## 2026-06-30 - [Remove innerHTML from renderError]
**Vulnerability:** The `renderError` function in `CircuitWeatherApp.js` constructed its entire DOM structure by assigning a template string directly to `sidebarContent.innerHTML`. If the `message` string or translation strings ever contained unescaped input, it could expose a DOM-based Cross-Site Scripting (XSS) vulnerability.
**Learning:** When refactoring `.innerHTML` to native DOM creation (`appendChild`) in vanilla JS components tested with a custom `documentMock` (e.g., `tests/circuit-weather-app.test.js`), update unit test assertions to inspect `.appendChild.mock.calls` rather than checking `.innerHTML`, as the mock document does not automatically serialize appended child nodes into an HTML string.
**Prevention:** Construct UI widgets using standard DOM manipulation methods (`document.createElement`, `textContent`, `setAttribute`) by default to prevent XSS.

## 2026-08-04 - [PrivacyModal block-wrapping fall-through]
**Issue:** `parseMarkdown` decided whether to wrap a block in `<p>` using a negative check (`if (!block.startsWith("<")) ...`). Because the parser escapes its input before converting markdown, the only `<` in play at that point are tags the parser itself emitted — so the check was safe, but it also let inline-only blocks (`<strong>`, `<a>`) through unwrapped, emitting inline content with no block parent.
**Learning:** Inferring a string's origin from its first character is fragile in a multi-stage parser (escape → convert inline → assemble blocks). It happened to be sound here only because escaping runs first; that invariant is easy to break later and hard to notice.
**Prevention:** Wrap by positive allowlist of the block tags the parser generates (`<h`, `<ul`), and let everything else fall through to `<p>`.
## 2025-02-25 - Prevent Multiple-Encoding Bypasses in Cloudflare Worker

**Vulnerability:** The Cloudflare worker validated user-provided paths (like `apiPath` and `tilePath`) directly after a single `decodeURIComponent()` slice. Attackers could theoretically bypass the path traversal `..` checks and strict character whitelists by double or triple encoding malicious payloads (e.g., `%252e%252e/` instead of `../`), leading to SSRF or directory traversal.
**Learning:** Cloudflare Workers don't automatically recursively decode paths in `url.pathname`. Validating a path that hasn't been fully decoded back to its canonical representation leaves a gap for WAF-style bypasses where nested encoding hides restricted character sequences from Regex validation.
**Prevention:** Always recursively decode the URL path string in a bounded loop (catching `URIError` for valid `%` chars) *before* executing security Regex allowlists, structure checks, and proxying to upstream services. Reject requests explicitly if the bounded loop depth limit is exceeded, as that indicates a highly suspicious payload attempting to consume CPU cycles via deeply nested encodings.
## 2026-06-30 - [Remove innerHTML from CircuitWeatherApp]
**Vulnerability:** The `CircuitWeatherApp` constructed options for dropdowns using `innerHTML` combined with a localized string and user inputs in some cases. If these translations strings or user inputs contained malicious content, it could expose a DOM-based Cross-Site Scripting (XSS) vulnerability.
**Learning:** Replaced `innerHTML` usage with `document.createElement`, `textContent`, and `appendChild` across UI initialization routines. When updating these usages, I noticed that `innerHTML` checks in unit tests fail because Vitest's internal custom `documentMock` implementation does not stringify nested nodes when they're appended. Instead of checking `.innerHTML`, the tests should check `.childNodes` or `textContent` directly to verify elements have been correctly appended.
**Prevention:** Construct UI widgets using standard DOM manipulation methods by default. When replacing `innerHTML` and verifying logic, ensure tests are querying the `childNodes` array or `textContent` of the custom mock document nodes, not expecting `innerHTML` to populate automatically.
