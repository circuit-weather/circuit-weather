## 2023-10-27 - [Defense-in-depth: X-Frame-Options Header]
**Vulnerability:** Missing `X-Frame-Options: DENY` header in the API Proxy responses.
**Learning:** While `Content-Security-Policy: frame-ancestors 'none'` is present, adding `X-Frame-Options` is a necessary defense-in-depth security enhancement for legacy browsers that might not respect the modern CSP directive to fully prevent clickjacking.
**Prevention:** Ensure any global API security headers object (e.g., `API_SECURITY_HEADERS`) includes both `X-Frame-Options` and `Content-Security-Policy: frame-ancestors` for comprehensive frame protection.
