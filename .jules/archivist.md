2025-02-18 - Missing API Endpoints in Documentation

Issue: The "API Endpoints" table in AGENTS.md was incomplete, listing only 2 of the 5 active worker routes.
Cause: Documentation drift as new features (tracks, radar JSON, asset proxying) were added to `worker.js` without updating `AGENTS.md`.
Fix: Updated AGENTS.md to include `/api/radar`, `/api/track/*`, and `/api/assets/*` with accurate caching policies derived from source code.
Prevention: When modifying `worker.js`, cross-reference `AGENTS.md` to ensure documentation matches the implementation.
