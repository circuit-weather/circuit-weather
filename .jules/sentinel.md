## 2024-05-23 - Header Allowlist for Worker Proxy
**Vulnerability:** Upstream headers (like `X-Secret-Header` or `Server`) were being leaked to the client because `handleTileRequest` in `src/worker.js` copied all headers and only removed a few specific ones (denylist approach).
**Learning:** Cloudflare Workers' `fetch` returns all upstream headers. Simply copying `new Headers(response.headers)` is insecure for proxying public traffic to internal or third-party upstreams.
**Prevention:** Use an allowlist approach when constructing the response headers. Explicitly copy only safe/necessary headers like `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`.

## 2024-06-25 - [Regex Validation Gaps]
**Vulnerability:** The `VALID_API_PATH_REGEX` allowed dots and slashes (`/^[a-zA-Z0-9/._-]*$/`), which successfully blocked directory traversal (`..`) but unintentionally permitted access to hidden files/directories (e.g., `/.env.png`) via the tile proxy.
**Learning:** Allowlist regexes for paths are necessary but insufficient on their own if they must include `/` and `.`. A regex that allows `.` for extensions also allows `.` for prefixes (hidden files).
**Prevention:** Always pair path regex validation with explicit checks for dotfiles (e.g., `part.startsWith('.')`) or use a regex that enforces structure (e.g., `^[^.][^/]*(\.[^/]+)?$`) rather than just character sets.

## 2026-02-16 - [Strict CSP via Worker Proxy]
**Vulnerability:** The application allowed `script-src` from `https://unpkg.com`, a public CDN where any user can publish malicious code. This created a supply chain risk (XSS if an attacker could inject a script tag pointing to unpkg).
**Learning:** Even with Subresource Integrity (SRI) on known scripts, a broad CSP `script-src` allows unknown scripts from the same origin.
**Prevention:** Implemented a "Pinned Asset Proxy" in Cloudflare Workers to fetch specific, versioned assets (Leaflet) and serve them from `self`. This allowed removing `unpkg.com` from `script-src` entirely, restricting execution to only verified, first-party code.
