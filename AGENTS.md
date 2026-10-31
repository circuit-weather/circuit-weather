# AGENTS.md - Circuit Weather Project Specification

## Overview

Circuit Weather is a real-time F1 race circuit weather radar application. It displays live weather radar overlays on maps of F1 circuits to help viewers understand weather conditions during race weekends.

---

## Technology Stack

| Layer    | Technology                                                |
| -------- | --------------------------------------------------------- |
| Frontend | Vanilla HTML/CSS/JS                                       |
| Mapping  | Mapbox GL JS (Primary) & Leaflet.js with Carto (Fallback) |
| Backend  | Cloudflare Workers with Static Assets                     |
| APIs     | Jolpica F1, TheSportsDB, LibreWXR, RainViewer, Open-Meteo, GitHub |

---

## Security Requirements

### API Keys & Secrets

- **NO API keys in frontend code** - All external APIs used are free/keyless
- **NO sensitive data in git** - `.gitignore` excludes `.env*`, `.wrangler/`
- **NO user authentication** - App is read-only, no user accounts

### Access Control

- **Hotlink Protection** - Strict `Sec-Fetch-Site`, `Origin`, and `Referer` checks in `src/worker.js` prevent unauthorized embedding.
- **XSSI Protection** - Validates `Sec-Fetch-Dest` to prevent API endpoints from being loaded as scripts or objects.
- **Rate Limiting** - In-memory IP-based limiting (1000 req/min per IP per isolate) protects upstream APIs from abuse.

### Third-Party Services

| Service         | Purpose                                                          | Connection           |
| --------------- | ---------------------------------------------------------------- | -------------------- |
| Jolpica F1 API  | Race schedule data (24-hour cache, 30-day last-known-good copy)  | Proxied (Cached)     |
| OpenF1          | Fallback race schedule data                                      | Direct (Client-side) |
| TheSportsDB     | Non-F1 series schedules (F2, F3, Formula E, WEC, IMSA, Supercars, IndyCar, NASCAR, MotoGP, WorldSBK) and venue coordinates (season state refreshed hourly to monthly per round, 180-day last-known-good copy; 30 requests/minute free tier, throttled in the Worker) | Proxied (Cached)     |
| LibreWXR        | Primary radar, nowcast and storm overlay tiles (2-hour cache; nowcast 5 minutes), satellite tiles (12-hour cache), metadata (1-minute cache, 30-minute last-known-good copy) and weather warnings (5-minute cache, 1-hour last-known-good copy) | Proxied (Cached)     |
| RainViewer      | Backup radar tiles (2-hour cache) and metadata (1-minute cache), used when LibreWXR fails | Proxied (Cached)     |
| Open-Meteo      | Weather forecasts                                                | Direct (Client-side) |
| Mapbox API      | Primary map basemap tiles and rendering                          | Direct (Client-side) |
| Carto           | Fallback map basemap tiles                                       | Direct (Client-side) |
| GitHub          | Track GeoJSON data (24-hour cache)                               | Proxied (Cached)     |
| Mapbox CDN      | Map library assets (1-year cache)                                | Proxied (Cached)     |
| Unpkg (Leaflet) | Map library assets (1-year cache)                                | Proxied (Cached)     |
| Google Fonts    | Typography                                                       | Direct (Client-side) |
| FlagCDN         | Country flags                                                    | Direct (Client-side) |
| Buy Me a Coffee | Support widget                                                   | Direct (Client-side) |

### Data Handling

- **No first-party cookies** used (third-party widgets may use cookies - see PRIVACY.md)
- **localStorage only** for theme/unit/language/series (last picked; used when the URL names none)/autoAdvance/windOverlay/radar layer (radarColour, radarArrows, radarCells, radarLightning, radarSatellite, weatherAlerts) preferences, f1_schedule_cache and series_schedule_cache
- **No PII collected** - See PRIVACY.md

### Language & Spelling

- **New Zealand English** - All documentation and user-facing text (e.g., UI labels, error messages) must use New Zealand English spelling conventions (e.g., 'colour', 'centre', 'programme', 'visualise').
- **Dates** - Use DD/MM/YYYY or ISO 8601 (YYYY-MM-DD).
- **Localisation Roadmap** - Continue improving translations/localisation over time. Prioritise the most widely used languages first, while maintaining quality and consistency across existing locale files.

---

## Deployment

### Platform

Cloudflare Workers with Static Assets

### Repository Structure

```
circuit-weather/
├── public/           # Static assets (served by Cloudflare)
│   ├── index.html
│   ├── styles.css
│   ├── privacy/      # Localized privacy policies
│   ├── src/          # Frontend ES modules (no build step)
│   │   ├── main.js   # Entry point
│   │   └── ...
│   ├── theme.js      # Runs first in <head>: theme (FOUC prevention), web font, schedule preload
│   ├── favicon.svg
│   ├── icon-192.png  # PWA icon (192×192)
│   ├── icon-512.png  # PWA icon (512×512)
│   ├── manifest.json # PWA web app manifest
│   ├── robots.txt    # Search engine directives
│   ├── sitemap.xml   # XML Sitemap for SEO
│   ├── sw.js         # Service worker (app shell caching)
│   ├── _headers      # Custom HTTP headers (CSP, security)
│   └── PRIVACY.md
├── src/
│   ├── worker.js          # Cloudflare Worker router (rate limiting, method/hotlink checks, dispatch)
│   ├── worker-utils.js    # Shared worker utilities
│   ├── radar-providers.js # LibreWXR/RainViewer metadata, tile routing and alert sanitising
│   ├── thesportsdb.js     # TheSportsDB client: throttle, coordinates, schedule normalising
│   └── handlers/          # Route handlers, one module per API domain
│       ├── f1.js          # /api/f1/* (Jolpica proxy + last-known-good copy)
│       ├── schedule.js    # /api/schedule/{series} (TheSportsDB, every non-F1 series)
│       ├── radar.js       # /api/radar, /api/tiles/*, /api/alerts
│       ├── track.js       # /api/track/*
│       ├── assets.js      # /api/assets/*
│       ├── health.js      # /api/health
│       └── config.js      # /api/config
├── docs/
│   └── thesportsdb-data-checklist.md # TheSportsDB fields each non-F1 series needs, and how to add a series
├── tests/              # Unit tests
├── wrangler.toml       # Cloudflare config
├── package.json        # Node.js dependencies
├── README.md
└── LICENSE
```

### Image Assets

| File           | Format | Size          | Purpose                                      | Source                                           |
| -------------- | ------ | ------------- | -------------------------------------------- | ------------------------------------------------ |
| `favicon.svg`  | SVG    | 24×24 viewBox | Browser tab icon                             | Hand-authored (red rounded rect + white F1 flag) |
| `icon-192.png` | PNG    | 192×192 px    | PWA icon (Android install, Apple touch icon) | Generated from `favicon.svg`                     |
| `icon-512.png` | PNG    | 512×512 px    | PWA splash screen / maskable icon            | Generated from `favicon.svg`                     |

**Regenerating icons**: If `favicon.svg` is updated, regenerate the PNGs at 192×192 and 512×512 using any SVG-to-PNG converter (e.g. `cairosvg`, Inkscape, or Pillow with manual drawing). The icons must visually match the favicon design.

### Build & Deploy

```bash
# Local development
pnpm run dev # or 'npx wrangler dev' / 'wrangler dev' based on environment availability

# Deploy to Cloudflare
# Deployment is automatic via Cloudflare Git Integration (Workers with Static Assets)
# when changes are merged to the 'main' branch.
```

**Note**: The project is connected to Cloudflare via GitHub integration. Pushing to `main` triggers automatic deployment - no manual `wrangler deploy` needed.

**Previews**: Pushes to any other branch build a [Worker Preview](https://developers.cloudflare.com/workers/previews/) (`npx wrangler preview`) at `<branch>-circuit-weather.<subdomain>.workers.dev`, behind Cloudflare Access. Previews do not inherit production settings: vars go in the `[previews.vars]` block of `wrangler.toml`, and secrets are set separately (Settings → Variables and secrets → Previews Base, or `npx wrangler preview base-config secret put <NAME>`).

### Cloudflare Configuration (wrangler.toml)

```toml
name = "circuit-weather"
main = "src/worker.js"
compatibility_date = "2024-09-23"
preview_urls = true

# Cloudflare Workers with Assets configuration
# https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
[assets]
directory = "./public"
binding = "ASSETS"
# Enable SPA fallback - serve index.html for 404s instead of redirecting
not_found_handling = "single-page-application"
# Only run the worker for API routes - all other routes use SPA fallback
run_worker_first = ["/api/*"]
[[routes]]
pattern = "circuit-weather.racing"
custom_domain = true
[placement]
mode = "smart"

[previews.vars]
ENVIRONMENT = "preview"
```

### Environment

- Environment variables:
  - `MAPBOX_ACCESS_TOKEN` (optional): Required to use the primary Mapbox GL JS renderer. If omitted, the app falls back to Leaflet.js.
  - `ENVIRONMENT` (optional): Defaults to 'production'.
  - `THESPORTSDB_API_KEY` (optional, secret): TheSportsDB API key for the non-F1 series schedules. Set it with `wrangler secret put THESPORTSDB_API_KEY` (or Settings → Variables and Secrets in the Cloudflare dashboard). If omitted, the public free key (`123`) is used. A premium key raises the rate limit; also raise `UPSTREAM_LIMIT_PER_MINUTE` in `src/thesportsdb.js` to match.
  - `DEBUG` (optional): Set to 'true' to enable detailed debug logging (e.g., exposing unredacted tile proxy paths in logs) when not in production.
- **Note:** An `.env.example` file is intentionally omitted. This project is standalone and does not intend to onboard human developers, so it doesn't require others to know how to configure or run it.
- No build step required (vanilla JS)

### Load Performance

Speed matters most on mobile at a circuit, so nothing may block the first render:

- **No render-blocking scripts.** Mapbox GL JS is preloaded (`fetchpriority="low"`) and run by `MapManager` once the token arrives; Leaflet is only fetched if Mapbox can't be used. The Buy Me a Coffee widget is loaded by `src/ui/BuyMeACoffee.js` after the page has loaded (its `document.writeln` is pointed at the container). The Inter stylesheet is added by `theme.js` (`display=swap`).
- **Early data.** `index.html` preloads `/api/config` and `/api/radar`; `theme.js` preloads the URL's schedule unless a fresh saved copy exists. The schedule loads in parallel with the map, not after it.
- **No module waterfall.** Every module imported at startup is a `<link rel="modulepreload">` in `index.html`; `tests/module-preload.test.js` fails if the list drifts from the imports. Non-English locales are dynamic imports (`LOCALE_LOADERS` in `src/i18n/index.js`), loaded only when chosen.

---

## Functionality Requirements

### Core Features

1. **Series/Round/Session Selection**
   - Series dropdown: Formula 1 (Jolpica, OpenF1 fallback), Formula 2, Formula 3, Formula E, WEC, IMSA, Supercars, IndyCar, NASCAR Cup, MotoGP and World Superbike (TheSportsDB via `/api/schedule/{series}`)
   - Round dropdown shows all races in current season with dates. Once a season is over, next season's first round is the next round: the Worker moves TheSportsDB series on to next season once its round 1 is listed, and F1 loads Jolpica's next-year calendar (`/api/f1/{year}.json`) once it is published, before `current` turns over in January. A saved schedule whose rounds are all over is fetched again
   - Switching series quickly: only the last series picked may change the rounds, URL or map (`beginScheduleLoad` in `CircuitWeatherApp.js`), and the map flies to each circuit straight away (`MapManager.setView` no longer waits for Mapbox to go idle, which animated radar tiles could put off indefinitely)
   - Session dropdown shows each series' sessions with times (F1: FP1-3, Sprint/Qualifying/Race; others: the session names TheSportsDB lists, e.g. Practice, Sprint Race, Feature Race)
   - **Session timing** (`public/src/utils/sessionTiming.js`, the only place it is decided): schedules give start times only, so a session counts as live from its start for an assumed length, cut short when the next session in the round starts (MotoGP and WEC run sessions 5-20 minutes apart). Lengths: 1 h 30 min for practice/qualifying/Hyperpole/sprints; 4 h for a round's main race (the session `race`, else the one at the round's date and time, e.g. MotoGP `gp`, F2/F3 Feature Race); 25 h for WEC and IMSA races. A round is over when its last session is. This drives the automatic pick on load (the live session, else the next), the LIVE/Next markers and auto-advance
   - **Auto-advance** toggle under the session picker (off by default; saved): moves to the next session, and the next round with the map, as each finishes, so the page can be left open as a console (`public/src/ui/AutoAdvance.js`, checked every 30 s and when the tab is seen again). A round or session picked by hand, or opened from a link, is left until the next scheduled change
   - TheSportsDB must be credited as the data source whenever its data is shown (sidebar credit line)

2. **Map Display**
   - Centred on selected circuit
   - Dark/light mode basemaps (Mapbox natively, Carto for Leaflet fallback)
   - Dynamic range circles (outline only) that scale based on map zoom/bounds
   - Distance labels on circles

3. **Weather Radar**
   - Live radar tiles from LibreWXR (RainViewer V2-compatible API), with RainViewer as an automatic fallback
   - Animated playback of past 2 hours plus LibreWXR's experimental 1-hour nowcast (forecast frames are marked on the slider)
   - Timeline slider (adaptive range), starting on the latest observed frame
   - Playback label relative to now ("20 min ago", "Live", "Forecast +20 min"), plus the selected session when it is within 6 hours ("35 min before Race", "1 h 10 min into Race")
   - Provider zoom limits come from `/api/radar` (`maxZoom`: 12 for LibreWXR, 7 for RainViewer). The client caps animation tiles at `CONFIG.RADAR_MAX_TILE_ZOOM` (8): radar data is ~1 km resolution, and each extra zoom level multiplies tile requests across every animation frame (zoom 9 meant ~150 tiles and ~170 MB of decoded images per view)
   - Optional LibreWXR extras: colour schemes, storm motion arrows, storm cells, lightning (Americas only) and satellite clouds
   - Rain at the track: `public/src/map/TrackRain.js` reads the latest observed frame and the nowcast within 3 km of the circuit (black-and-white scheme 0 tiles, where red = dBZ + 32; 20 dBZ counts as rain). While the session is on or starts within the hour, "Rain expected at the track in about 20 min" / "Raining at the track" takes the rain banner (see Weather Forecast). LibreWXR only; nothing is shown for a dry reading or on the RainViewer fallback
   - Attribution: LibreWXR data is CC BY 4.0 and must be credited on the map (plus "Radar-DPC" for Italian data)

4. **Session Countdown**
   - Countdown timer to selected session start
   - Format: days/hours or HH:MM:SS
   - Hidden if target time has passed or session is live

5. **URL Routing**
   - Format: `/{series}/{round}/{session}` (e.g. `/f1/3/race`, `/f2/13/feature-race`)
   - Shareable links
   - Browser back/forward support

6. **Theme Toggle**
   - Dark/light mode
   - Persists in localStorage
   - Updates both UI and map tiles

7. **Unit Toggle**
   - Imperial (miles) / Metric (km)
   - Persists in localStorage
   - Updates range circles

8. **Language Toggle**
   - Multi-language support (e.g., English, French, Spanish)
   - Persists in localStorage
   - Updates UI text dynamically

9. **Weather Forecast**
   - Session-specific weather forecast (temperature, rain probability, wind)
   - Fetched directly from Open-Meteo API
   - Hourly forecast timeline
   - Rain banner over the map (top centre; under the race card on mobile), the only place rain is summed up, with one message at a time: rain at the track from the radar while the session is on or within the hour, otherwise a one-line verdict for the session ("Rain likely during Race: 60% around 15:00") from the peak rain probability while it runs (races 2 hours, other sessions 1). Only shown when rain is possible (20%+), only from 3 days before the session until it ends (`RAIN_BANNER_LEAD_HOURS` in `public/src/utils/rain.js`), and recomputed on every forecast refresh

10. **Wind Overlay**
    - Animated wind flow particles over the map
    - Can be toggled on or off via UI
    - Persists in localStorage

11. **Weather Warnings**
    - Official WMO CAP alerts from LibreWXR for a box around the selected circuit
    - Drawn as severity-coloured polygons on the map and listed in the sidebar
    - Alert text is third-party content: render it with `textContent` only
    - Can be toggled on or off via UI (on by default); persists in localStorage

### API Endpoints

| Endpoint        | Purpose                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `/api/f1/*`     | Proxies to Jolpica F1 API with 24-hour edge caching; serves a 30-day last-known-good copy if Jolpica fails   |
| `/api/schedule/{series}` | Non-F1 season (`f2`, `f3`, `fe`, `wec`, `imsa`, `supercars`, `indycar`, `nascar`, `motogp`, `wsbk`; see `SERIES` in `src/thesportsdb.js`) built round by round from TheSportsDB, with at most 10 upstream calls per request, a 20/minute per-isolate throttle and a 60-second pause after a 429. Returns Ergast-shaped races with a `sessions` array and `complete: false` (cached 1 minute) while still filling; complete schedules are cached 15 minutes. Two days after a season's last event it moves on to next season as soon as TheSportsDB lists that season's round 1 |
| `/api/radar`    | LibreWXR radar metadata (RainViewer fallback), normalised with `provider` and `maxZoom`, 1-minute caching; serves a 30-minute last-known-good copy if both fail |
| `/api/tiles/*`  | Proxies LibreWXR radar/satellite tiles (and `/rainviewer/...` fallback tiles) with 2-hour edge caching; nowcast tiles 5 minutes, satellite tiles 12 hours |
| `/api/alerts`   | Proxies LibreWXR weather alerts for `?lat=&lon=` (±2° box) with 5-minute caching and a 1-hour last-known-good copy (expired alerts dropped); output is sanitised GeoJSON |
| `/api/track/*`  | Proxies to GitHub for GeoJSON track data with 24-hour caching                                                |
| `/api/assets/*` | Proxies to Unpkg (Leaflet) and Mapbox CDNs for map library assets with 1-year immutable caching (strict CSP) |
| `/api/health`   | System status check (connectivity to upstreams, version, env) with 60-second caching                         |
| `/api/config`   | Securely provides client configuration (e.g., Mapbox token) to the frontend with 24-hour caching             |

---

## Prohibited Changes

> **Do NOT add a "Skip to content" link.** This is a single-page application with only one view — there is no repeated navigation block to skip past. A "Skip to content" link serves no purpose here and should not be introduced.

---

## Known Limitations

1. **Radar Zoom Limits** - LibreWXR serves tiles up to zoom 12; the RainViewer fallback free tier is limited to zoom 7 (Jan 2026). We use **512px tiles** with `zoomOffset: -1` (Leaflet `maxNativeZoom` = limit + 1) to reduce requests.
2. **LibreWXR Public Instance** - Best-effort with no published uptime or rate limits, which is why RainViewer stays as a fallback. The nowcast is experimental, lightning only covers the Americas, and radar coverage outside the US, Canada, Europe, Japan and parts of Asia comes from satellite estimates and model data.
3. **Radar Opacity** - Tiles must be added with small opacity (0.01) initially to trigger loading.
4. **F1 API Rate Limits** - Edge caching via Worker mitigates this.
5. **TheSportsDB Free Tier** - 30 requests/minute and only 15 events from the season endpoint, so `/api/schedule/{series}` builds a season over a few requests (nearest the next round first) and the client re-fetches partial schedules. Its data has gaps: F3 rounds and some late-season F2 rounds list only races, some Formula E rounds have no venue (no coordinates), and only venues F1 also races on get a track outline (F2/F3/WEC/IMSA/Supercars only; Formula E, IndyCar, NASCAR and the bike series run different layouts). WEC lists qualifying and Hyperpole per class (e.g. "Hyperpole - Hypercar"), and some session starts are listed as 00:00 UTC placeholders. Some leagues lag on `strCurrentSeason` (IMSA), so the season is the later of it and the latest finished event's season; MotoGP and IndyCar put a placeholder venue (ID 1, no coordinates) on most events, so venues with coordinates win. See `docs/thesportsdb-data-checklist.md` for every field to check when auditing or fixing a league's data.
6. **Current Weather Rate Limits** - The live current weather widget triggers an Open-Meteo API call per circuit change, which may hit 429 rate limits during high traffic.

---

## Test & Verification File Policy

> **Important**: Do NOT persist one-off test scripts, verification files, or debug artifacts in the project.

### Rules

1. **No ad-hoc test files** - Scripts like `verify_*.py`, `test_*.js`, or similar should not be committed
2. **No screenshots or artifacts** - Files like `verification.png`, `debug_output.txt`, etc. must be deleted after use
3. **Clean up after yourself** - If you create temporary files for testing, remove them before completing your task
4. **Use proper test locations** - Persistent unit tests should be placed in the `tests/` directory and must pass `pnpm test`.

### If You Find Orphaned Test Files

If you discover files that appear to be one-off agent tests (e.g., standalone verification scripts not referenced anywhere), flag them to the user for removal.

---

## Local Development

> **Note:** These instructions are for **AI Agents** working on the project. This project does not intend to onboard human developers; human developers do not need instructions on how to run the project locally. If you just want to use the site, please visit the live version at **https://circuit-weather.racing**.

This project uses [Cloudflare Workers](https://workers.cloudflare.com/) to proxy API requests, so a simple static web server is not enough. You'll need to use the `wrangler` CLI to run it locally.

1.  **Clone the repository.**
2.  **Install Node.js.**
    If you don't have Node.js installed, download it from [nodejs.org](https://nodejs.org/). **v24+ is recommended** to match the CI environment.
3.  **Install dependencies.**
    Run the following command in your terminal at the root of the project:
    ```bash
    pnpm install
    ```
4.  **Start the local development server.**
    Run the following command based on your environment:

    ```bash
    # Standard: Ensures the exact 'wrangler' version defined in package.json is used (matches CI)
    pnpm run dev

    # Alternative 1: If you have 'wrangler' installed globally on your system
    wrangler dev

    # Alternative 2: If 'pnpm' is unavailable and you need to fetch 'wrangler' dynamically
    npx wrangler dev
    ```

5.  **Open the local address in your browser.**
    Wrangler will typically open the site at `http://localhost:8787`.

This setup faithfully reproduces the production environment, running both the frontend and the worker for API requests.

### Running Tests

This project uses `vitest` for unit testing both the Worker logic and frontend components.

```bash
# Run the test suite once
pnpm test

# Run the test suite in watch mode (recommended for development)
pnpm run test:watch
```

#### Test Coverage

The CI pipeline enforces strict code coverage thresholds defined in `vitest.config.js`. Pull requests will fail if coverage drops below these values.

To verify coverage locally before pushing:

```bash
pnpm run test:coverage
```

### Terminating Background Processes

> **Important for Google Antigravity**: The `send_command_input` tool's `Terminate` flag does **NOT** reliably kill background processes on this system. It may report success but the process continues running and holding its port. **Do not use it.** Instead, always use the following manual methods to stop background processes:

**Windows (PowerShell):**

```powershell
# Find the PIDs listening on the target port (e.g. 8787 for wrangler dev)
netstat -ano | findstr ":8787"

# Kill each PID found
taskkill /PID <pid> /F
```

**Linux / macOS (Bash):**

```bash
# Find the PIDs listening on the target port
lsof -i :8787

# Kill the process (replace <PID> with the actual process ID)
kill -9 <PID>
```

> Always verify the port is free before starting a new server instance.

## Compatibility

**Apple Silicon:** Development on Apple Silicon (M1/M2/M3) Macs is fully supported.

**Raspberry Pi / Linux ARM:** Please note that the `wrangler` CLI may encounter an `Unsupported platform` error during installation on Linux ARM-based systems (like the Raspberry Pi). Development is recommended on an x86/x64-based machine or Apple Silicon Mac.

## Before you start: look at the open pull requests

List the open pull requests and check whether one already touches the file or
symbol you are about to change. If it does, work on something else.

Several agents run against this repository independently and cannot see each
other's work, so they converge on the same target often. One review across these
repositories found three byte-identical pull requests renaming a single import,
three separate attempts at splitting one function, and three sets of tests for
one endpoint — eleven of the thirty rejected pull requests were duplicates of
another open one.

`.github/workflows/overlapping-pr-check.yml` comments on a pull request when
another open one edits the same files. It does not block anything; overlap is
normal on a busy branch. Treat it as a prompt to check whether the two are doing
the same work, and to close the weaker one before both reach review.

## Reporting "no change needed"

Finding that a task needs no code change is a complete result. Report it and
stop. Do not open a pull request, and do not add an unrelated edit so that a
pull request has something to carry.

This used to be enforced the other way round. A CI gate (`empty-commit-check`)
failed any branch whose diff was empty. It did stop empty pull requests, and it
started a worse habit: agents began manufacturing a change to get the gate
green. One wrote the tactic into its own journal — *"apply a completely safe,
trivial code health cleanup ... to satisfy the CI file modification
requirement"* — directly beneath an older entry telling the same agent not to
introduce unnecessary modifications.

The filler was not always safe. Across one review of the open pull requests in
these repositories it suppressed worker error reporting in production builds,
made a failed upload report the wrong reason, and moved a content-type check to
after the response had been buffered into memory.

In its place, `.github/workflows/no-op-pr.yml` closes a pull request whose diff
is empty, with a comment saying why. A close is not
a failure — it is the same finding, recorded without costing anyone a review.
