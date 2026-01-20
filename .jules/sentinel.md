## 2026-01-19 - API Proxy Rate Limiting Gap
**Vulnerability:** The API proxy in `src/worker.js` acts as an open proxy for the Ergast F1 API (via `/api/f1/*`) without any application-level rate limiting. While it has input validation, it does not prevent a user from flooding the upstream service by requesting valid but distinct paths.
**Learning:** Even serverless functions (Cloudflare Workers) that are protected by platform-level DDOS mitigation can still be abused to exhaust upstream API quotas or cause costs if not explicitly rate-limited at the application logic level.
**Prevention:** Implement rate limiting using Cloudflare Workers KV or Durable Objects to track request counts per IP, or configure Cloudflare's WAF Rate Limiting rules if available on the plan.

## 2026-01-24 - Client-side Third-Party API Exposure
**Vulnerability:** The frontend was directly contacting Open-Meteo API, exposing user IP addresses and lacking centralized control/caching.
**Learning:** Even for public APIs, direct client-side access couples the frontend to the 3rd party API structure and leaks metadata (user IP) which might be undesirable for privacy-focused apps.
**Prevention:** Proxy all external API calls through the Worker/Backend to enforce input validation, cache responses, and mask client identity.
