## 2024-05-23 - Header Allowlist for Worker Proxy
**Vulnerability:** Upstream headers (like `X-Secret-Header` or `Server`) were being leaked to the client because `handleTileRequest` in `src/worker.js` copied all headers and only removed a few specific ones (denylist approach).
**Learning:** Cloudflare Workers' `fetch` returns all upstream headers. Simply copying `new Headers(response.headers)` is insecure for proxying public traffic to internal or third-party upstreams.
**Prevention:** Use an allowlist approach when constructing the response headers. Explicitly copy only safe/necessary headers like `Content-Type`, `Content-Length`, `ETag`, `Last-Modified`.
