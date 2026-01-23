## 2026-01-19 - API Proxy Rate Limiting Gap
**Vulnerability:** The API proxy in `src/worker.js` acts as an open proxy for the Ergast F1 API (via `/api/f1/*`) without any application-level rate limiting. While it has input validation, it does not prevent a user from flooding the upstream service by requesting valid but distinct paths.
**Learning:** Even serverless functions (Cloudflare Workers) that are protected by platform-level DDOS mitigation can still be abused to exhaust upstream API quotas or cause costs if not explicitly rate-limited at the application logic level.
**Prevention:** Implement rate limiting using Cloudflare Workers KV or Durable Objects to track request counts per IP, or configure Cloudflare's WAF Rate Limiting rules if available on the plan.

## 2026-01-24 - Client-side Third-Party API Exposure
**Vulnerability:** The frontend was directly contacting Open-Meteo API, exposing user IP addresses and lacking centralized control/caching.
**Learning:** Even for public APIs, direct client-side access couples the frontend to the 3rd party API structure and leaks metadata (user IP) which might be undesirable for privacy-focused apps.
**Prevention:** Proxy all external API calls through the Worker/Backend to enforce input validation, cache responses, and mask client identity.

## 2026-01-26 - Dual CSP Strategy for Hybrid Deployment
**Vulnerability:** The production CSP in `public/_headers` was overly permissive (allowing direct API connections) to support the same configuration as local development, undermining the security benefits of the API proxy.
**Learning:** When using a split architecture (Proxy in Prod, Direct in Local), a single CSP often defaults to the "lowest common denominator" (permissive).
**Prevention:** Implement "Split Horizon CSP": Use a strict CSP in production headers (via `_headers`) that enforces proxy usage (`connect-src 'self'`), while allowing a more permissive CSP in the `index.html` meta tag (or dev server config) to support local development where the proxy is absent.

## 2026-02-05 - Context-Aware Output Encoding for Upstream Data
**Vulnerability:** The `MapWeatherWidget` injected weather unit strings (e.g., "°C", "km/h") directly from the API response into the DOM via `innerHTML` without sanitization. While the units usually come from a trusted source, a compromised upstream API or proxy could inject malicious HTML (XSS).
**Learning:** "Trusted" upstream APIs should still be treated as untrusted input sources when rendering to the DOM. Relying on the data type (string vs number) is insufficient in loosely typed languages like JS.
**Prevention:** Always use context-aware output encoding (e.g., `textContent` or an `escapeHtml` utility) for ALL dynamic data injected into HTML, regardless of the source's perceived trustworthiness.

## 2026-02-06 - Cache Key Request Header Poisoning
**Vulnerability:** The `handleApiRequest` function in `src/worker.js` included the full client request object (headers, method, etc.) in the cache key calculation via `new Request(upstreamUrl, request)`. This allowed attackers to bypass the cache and exhaust the upstream API quota by sending requests with varying headers (e.g., random `User-Agent` or `Accept` headers).
**Learning:** Cloudflare Workers' `caches.default` respects the request object's headers if provided in the key. For public APIs where the response is identical regardless of client headers, the cache key should be normalized to the URL only.
**Prevention:** Always construct cache keys using only the canonical URL (`new Request(url)`) unless the response explicitly varies by specific headers (which should then be listed in the `Vary` header).

## 2026-02-09 - Loose API Method Handling
**Vulnerability:** The Cloudflare Worker API proxy accepted all HTTP methods (e.g., POST, PUT, DELETE) and forwarded them as GET requests to the upstream API. This created ambiguity in the API contract, potentially masked client-side errors, and failed to handle CORS preflight (OPTIONS) requests correctly (returning 200 OK with content instead of 204 No Content).
**Learning:** Even if an upstream API is read-only, a proxy should strictly enforce the expected method contract to prevent confusion and misuse. Explicitly handling OPTIONS is critical for correct CORS behavior, even for simple GET requests, to ensure browser compliance and prevent unnecessary upstream traffic.
**Prevention:** Implement a strict method whitelist (e.g., GET, HEAD) at the entry point of the API proxy and explicitly handle OPTIONS requests with appropriate CORS headers before checking the whitelist.

## 2026-02-12 - Inconsistent Security Headers on Error Responses
**Vulnerability:** The API proxy's catch-all 404 handler and 405 Method Not Allowed handler failed to include critical security headers (CSP, HSTS) and CORS headers (`Access-Control-Allow-Origin`). This could lead to client-side CORS errors masking the true error (404/405) and left error pages unprotected by CSP.
**Learning:** Security headers and CORS logic are often applied to "success" paths but easily forgotten in edge-case error handlers. Browsers still require valid CORS headers to permit JavaScript to read the status code and body of an error response.
**Prevention:** Centralize response creation or use a middleware pattern to ensure security and CORS headers are applied to *every* response, including 404s and 500s.

## 2026-02-14 - Pre-Regex Input Length Validation
**Vulnerability:** The `handleWeatherRequest` function in `src/worker.js` used a regular expression to validate latitude and longitude parameters without checking their length first. This could expose the worker to Regular Expression Denial of Service (ReDoS) or resource exhaustion if an attacker sent extremely long strings.
**Learning:** Regular expressions, even simple ones, should not be the first line of defense against massive inputs. Validating input size provides a cheap, effective guard before more expensive parsing logic runs.
**Prevention:** Always enforce strict maximum length limits on string inputs *before* passing them to regex validation or parsing functions.

## 2026-02-16 - Coordinate Canonicalization for Cache Efficiency
**Vulnerability:** The weather API proxy accepted arbitrary floating-point coordinates, allowing attackers to bypass the cache and exhaust upstream API limits by sending requests with slightly different coordinates (e.g. 1.000001 vs 1.000002).
**Learning:** High-precision numeric inputs in cache keys can effectively render the cache useless if the attacker controls the precision. "Grid snapping" or rounding is essential for geospatial caching.
**Prevention:** Canonicalize/round numeric inputs (especially coordinates) to a reasonable precision (e.g. 2 decimal places for weather) before generating cache keys or upstream requests.

## 2026-02-18 - Process Isolation without Breakage
**Vulnerability:** The application lacked `Cross-Origin-Opener-Policy` (COOP) and `Cross-Origin-Resource-Policy` (CORP), leaving it potentially exposed to XS-Leaks and process-based side-channel attacks (Spectre).
**Learning:** While `Cross-Origin-Embedder-Policy` (COEP) provides the strongest isolation (required for `SharedArrayBuffer`), it aggressively blocks cross-origin resources (scripts, images) that don't opt-in via CORP. For apps relying on third-party CDNs (unpkg, cartocdn), enabling COEP is a breaking change.
**Prevention:** Implement `COOP: same-origin` and `CORP: same-origin` to gain significant process isolation and resource protection benefits without the breakage associated with COEP. This isolates the browsing context and prevents other sites from embedding the application's resources.

## 2026-02-19 - Hidden File Exposure via Proxy
**Vulnerability:** The API proxy `handleApiRequest` allowed request paths containing segments starting with `.` (e.g. `/.env`, `/drivers/.git/config`). This could potentially expose hidden files or configuration directories on the upstream server if they are not blocked by the upstream server itself.
**Learning:** Regular expressions for allowed characters (`/^[a-zA-Z0-9/._-]*$/`) often inadvertently allow unsafe patterns like dotfiles. Explicitly checking for dangerous path components (like segments starting with `.`) is necessary for robust proxy security.
**Prevention:** In any proxy logic, inspect the path segments and strictly block any segment that starts with `.` (excluding `.`, `..` which are handled by path normalization usually, but `.` as a prefix to a name like `.env` must be blocked).

## 2026-02-21 - URL Scheme Validation Bypass via Control Characters
**Vulnerability:** The `sanitizeUrl` function in `public/app.js` used a regex to detect URL schemes but failed to strip control characters and whitespace. This allowed malicious schemes like `java\nscript:` to bypass the detection regex (which expected a colon immediately after the scheme) and be treated as safe relative URLs.
**Learning:** Regex-based validation of URL schemes is brittle if the input is not first canonicalized. Browsers may ignore control characters in attributes, allowing "broken" schemes to execute.
**Prevention:** Always strip all whitespace (`\s`) and control characters (`\x00-\x1F`) from URL inputs *before* passing them to validation logic.

## 2026-02-22 - Missing Security Headers on API Error Responses
**Vulnerability:** API error responses (404, 502) in `src/worker.js` handlers (`handleApiRequest`, `handleTrackRequest`) lacked `Content-Security-Policy` and `Cache-Control` headers, potentially allowing error page caching or content sniffing.
**Learning:** Centralized security headers are often applied to success paths but easily missed in scattered `catch` blocks or conditional error returns.
**Prevention:** Ensure `DEFAULT_SECURITY_HEADERS` are spread into every `new Response()` call, including those in catch blocks and error conditions.
