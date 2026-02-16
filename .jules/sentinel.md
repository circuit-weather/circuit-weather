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

## 2026-02-16 - [CSP Hash vs. Unsafe-Inline Conflict]
**Vulnerability:** The application's Content Security Policy (CSP) contained both `unsafe-inline` and SHA-256 hashes in the `style-src` directive. Modern browsers ignore `unsafe-inline` when hashes are present, which inadvertently broke legitimate inline styles required by libraries like Leaflet for map tile positioning.
**Learning:** Adding hashes to CSP `style-src` implicitly disables `unsafe-inline` for `<style>` blocks and attributes (unless `unsafe-hashes` is supported/used), causing unexpected breakage for dynamic UI libraries.
**Prevention:** Avoid mixing `unsafe-inline` and hashes in the same directive unless you fully understand the precedence rules. If a library requires `unsafe-inline` for dynamic styles (like Leaflet), do not include hashes for static `<style>` blocks in the same policy; move static styles to external files or accept `unsafe-inline` globally.

## 2026-02-16 - [Proxying Static Assets for CSP]
**Vulnerability:** Loading CSS/JS from public CDNs (like `unpkg.com`) in CSP `style-src`/`script-src` allows any malicious file from that CDN to be executed if injected.
**Learning:** Even with SRI, a broad CSP allowance (`https://unpkg.com`) permits loading arbitrary styles/scripts if an XSS vulnerability exists.
**Prevention:** Use a Cloudflare Worker proxy (`/api/assets/*`) to fetch specific, versioned files from the CDN and validate their Content-Type. This allows the CSP to be tightened to `self` only, removing the CDN origin entirely.

## 2026-02-16 - [Strict Asset Proxy with Integrity Verification]
**Vulnerability:** The application proxied Leaflet assets from `unpkg.com` via a Cloudflare Worker to enforce strict CSP. However, the worker did not verify the integrity of the upstream response, meaning a compromised CDN or supply chain attack could serve malicious code that the worker would cache and serve as "trusted" (same-origin).
**Learning:** Relying solely on client-side SRI allows the worker to be poisoned. A trusted proxy must verify the integrity of the content it serves, especially when it acts as a gatekeeper for CSP.
**Prevention:** Implemented SHA-256 hash verification in the worker proxy (`handleLeafletRequest`). The worker now calculates the hash of the upstream response body and compares it against a hardcoded allowlist of known-good hashes before serving or caching the file. This effectively pins the dependencies in the backend.
