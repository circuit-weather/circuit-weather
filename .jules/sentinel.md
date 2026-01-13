## 2024-05-22 - Proxy Path Traversal
**Vulnerability:** Unvalidated user input in URL path construction (`apiPath` extracted from URL and appended to upstream URL) allowed accessing unintended upstream endpoints via directory traversal (`../`).
**Learning:** Even simple string replacements for proxying can be vulnerable. Node's `URL` normalization handles `..` in standard paths, but encoded characters (`%2e%2e`) or subtle API behaviors might bypass it if not explicitly validated.
**Prevention:** Always validate and sanitize input used in path construction. Specifically check for `..` (both raw and decoded) and potentially restrict allowed characters or structure.
