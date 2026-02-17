# WEC Implementation & Caching Issues - TODO

## Current Status
The WEC session logic has been verified and confirmed to handle missing session times correctly (returning `null`). The persistent caching issue in local development was caused by the Service Worker caching a non-existent `app.js` file and aggressive browser caching. This has been resolved by updating the Service Worker and implementing manual cache busting.

## What Has Been Done
1.  **Code Fixes:**
    *   Renamed `app.js` to `cw-app.js` (previous step).
    *   Updated `index.html` to reference `cw-app.js` with a version query parameter (`?v=6`).
    *   Updated `sw.js` (Service Worker) to cache `cw-app.js` instead of the deleted `app.js`.
    *   Incremented Service Worker cache version to `circuit-weather-v2` to force client updates.
    *   Added `theme.js` to Service Worker app shell for offline consistency.
    *   Verified WEC logic handles `00:00:00` times correctly via a standalone test script.
    *   Verified WEC venue mappings against TheSportsDB API responses.

2.  **Infrastructure:**
    *   Implemented manual cache busting in `index.html`.

## What Has Not Worked
*   **Persistent Stale Serving:** Resolved. The root cause was the Service Worker looking for the old file and failing to update the app shell.

## Next Steps (To Be Addressed)
1.  **WEC Data:**
    *   Monitor TheSportsDB API for updates to WEC Round 1/2 data (currently only "Race" session is available).
    *   Consider adding fallback logic if TBD times persist close to race day (though current "TBD" display is safe).

2.  **Build Process:**
    *   Consider moving away from serving `src/` directly to a built `dist/` folder to having explicit control over file hashing and serving (Long term).

## Critical Files
*   `public/cw-app.js` (The fixed application file)
*   `public/index.html` (Points to `cw-app.js?v=6`)
*   `public/sw.js` (Updated to cache `cw-app.js`)
