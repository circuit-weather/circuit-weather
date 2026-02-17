# WEC Implementation & Caching Issues - TODO

## Current Status
The WEC session logic has been updated to handle missing session times (Round 1 Qatar, Round 2 Imola) by displaying "TBD" and preventing `NaN` errors in the Radar and Countdown. However, the update is **not consistently applying** in the local development environment due to aggressive caching by `wrangler`.

## What Has Been Done
1.  **Code Fixes:**
    *   Renamed `app.js` to `cw-app.js` to force a cache break.
    *   Updated `index.html` to reference `cw-app.js`.
    *   Added checks in `cw-app.js` for `Invalid Date` and `null` times (fixing `NaN:NaN:NaN` and `NaNm after`).
    *   Updated CSP in `_headers` to allow F1 and Radar APIs.
2.  **Infrastructure Attempts:**
    *   Cleared `.wrangler` directory.
    *   Changed `wrangler.toml` name to `circuit-weather-dev` to force new worker instance.
    *   Verified file content on disk is correct.

## What Has Not Worked
*   **Persistent Stale Serving:** `wrangler dev` continues to serve an old version of `index.html` (requesting `app.js`) and even serves the *deleted* `app.js` file in some contexts, unless a cache-busting query string (`?t=...`) is manually appended to the URL.
*   **Default Experience:** Opening `http://127.0.0.1:8787/` (without query params) loads the broken/stale version, meaning the fix is effectively "not working" for a normal user flow.

## Next Steps (To Be Addressed)
1.  **Deep Clean Wrangler State:**
    *   Investigate where `wrangler` stores its asset cache beyond `.wrangler/`.
    *   Consider fully reinstalling `node_modules` or using a completely clean clone.
2.  **Build Process:**
    *   Consider moving away from serving `src/` directly to a built `dist/` folder to having explicit control over file hashing and serving.
3.  **Browser/Worker Cache:**
    *   Investigate if the Service Worker (`sw.js`) is effectively caching `index.html` regardless of server changes (though `wrangler` usually bypasses this in dev).
4.  **WEC Data:**
    *   Monitor TheSportsDB API for updates to WEC Round 1/2 data (currently only "Race" session is available).

## Critical Files
*   `public/cw-app.js` (The fixed application file)
*   `public/index.html` (Should point to `cw-app.js`)
*   `wrangler.toml` (Renamed to `circuit-weather-dev`)
