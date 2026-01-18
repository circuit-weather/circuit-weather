# Sentinel Journal

This journal documents CRITICAL security learnings found during security reviews.

## Format
## YYYY-MM-DD - [Title]
**Vulnerability:** [What you found]
**Learning:** [Why it existed]
**Prevention:** [How to avoid next time]

## 2025-02-18 - Cloudflare Worker CORS Permissiveness
**Vulnerability:** The API proxy was configured with `Access-Control-Allow-Origin: *`, allowing any third-party site to consume the worker's resources and quota.
**Learning:** Cloudflare Workers acting as proxies often default to global access unless restricted. Unlike traditional backends behind a gateway, they are directly exposed.
**Prevention:** Implement a strict origin whitelist (`getAllowedOrigin` helper) and apply it dynamically to `Access-Control-Allow-Origin` headers, ensuring `Vary: Origin` is set for correct caching.

## 2025-02-18 - Unbounded Input Processing
**Vulnerability:** The API proxy accepted input segments of arbitrary length, which could be used to cause excessive resource consumption (DoS) or potential upstream issues.
**Learning:** Regex validation `/^[a-zA-Z0-9]*$/` checks content but not length. Explicit length checks are required for robustness.
**Prevention:** Always combine regex validation with explicit `.length` checks for user inputs, especially when constructing upstream URLs.
