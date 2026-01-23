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
