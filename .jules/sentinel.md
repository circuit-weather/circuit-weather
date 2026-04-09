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
