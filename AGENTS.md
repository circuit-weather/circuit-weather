# AGENTS.md - Circuit Weather Project Specification

## Overview

Circuit Weather is a real-time F1 race circuit weather radar application. It displays live weather radar overlays on maps of F1 circuits to help viewers understand weather conditions during race weekends.

---

## Technology Stack

| Layer    | Technology                                          |
| -------- | --------------------------------------------------- |
| Frontend | Vanilla HTML/CSS/JS                                 |
| Mapping  | Mapbox GL JS (Primary) & Leaflet.js with Carto (Fallback) |
| Backend  | Cloudflare Workers with Static Assets               |
| APIs     | Jolpica F1, RainViewer, Open-Meteo, GitHub (Tracks) |

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
| Jolpica F1 API  | Race schedule data (1-hour cache)                                | Proxied (Cached)     |
| RainViewer      | Weather radar tiles (2-hour cache) and metadata (1-minute cache) | Proxied (Cached)     |
| Open-Meteo      | Weather forecasts                                                | Direct (Client-side) |
| Carto           | Map basemap tiles                                                | Direct (Client-side) |
| GitHub          | Track GeoJSON data (24-hour cache)                               | Proxied (Cached)     |
| Unpkg (Leaflet) | Map library assets (1-year cache)                                | Proxied (Cached)     |
| Google Fonts    | Typography                                                       | Direct (Client-side) |
| FlagCDN         | Country flags                                                    | Direct (Client-side) |
| Buy Me a Coffee | Support widget                                                   | Direct (Client-side) |

### Data Handling

- **No first-party cookies** used (third-party widgets may use cookies - see PRIVACY.md)
- **localStorage only** for theme/unit preferences
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
│   ├── src/          # Frontend ES modules (no build step)
│   │   ├── main.js   # Entry point
│   │   └── ...
│   ├── theme.js      # Critical for FOUC prevention (load in head)
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
│   ├── worker.js       # Cloudflare Worker (API proxy + asset serving)
│   └── worker-utils.js # Shared worker utilities
├── tests/              # Unit tests
├── .jules/             # Jules AI agent config (MUST be lowercase)
├── wrangler.toml       # Cloudflare config
├── package.json        # Node.js dependencies
├── README.md
└── LICENSE
```

> **Important for Jules**: The `.jules` directory must **always** be lowercase (`.jules`, not `.Jules`). GitHub runs on Linux (case-sensitive), and creating `.Jules` alongside `.jules` causes conflicts on Windows/macOS (case-insensitive). Always use `.jules` with a lowercase `j`.

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
```

### Environment

- No environment variables required (optional: `ENVIRONMENT` defaults to 'production')
- No build step required (vanilla JS)

---

## Functionality Requirements

### Core Features

1. **Series/Round/Session Selection**
   - Series dropdown (F1 only currently)
   - Round dropdown shows all races in current season with dates
   - Session dropdown shows FP1-3, Sprint/Qualifying/Race with times

2. **Map Display**
   - Centred on selected circuit
   - Dark/light mode basemaps (Mapbox natively, Carto for Leaflet fallback)
   - Dynamic range circles (outline only) that scale based on map zoom/bounds
   - Distance labels on circles

3. **Weather Radar**
   - Live radar tiles from RainViewer (V2 API)
   - **Historical Only**: Free tier API no longer supports forecast/nowcast data
   - Animated playback of past 2 hours
   - Timeline slider (adaptive range)
   - Session-relative time display ("5m before", "10m after")
   - Must handle RainViewer's zoom limit (maxNativeZoom: 8)

4. **Session Countdown**
   - Countdown timer to selected session start
   - Format: days/hours or HH:MM:SS
   - Hidden if target time has passed or session is live

5. **URL Routing**
   - Format: `/f1/{round}/{session}`
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

8. **Weather Forecast**
   - Session-specific weather forecast (temperature, rain probability, wind)
   - Fetched directly from Open-Meteo API
   - Hourly forecast timeline


### API Endpoints

| Endpoint        | Purpose                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| `/api/f1/*`     | Proxies to Jolpica F1 API with 1-hour edge caching                                   |
| `/api/radar`    | Proxies to RainViewer Maps API with 1-minute caching (initializes animation)         |
| `/api/tiles/*`  | Proxies to RainViewer tile API with 2-hour edge caching (512px optimized)            |
| `/api/track/*`  | Proxies to GitHub for GeoJSON track data with 24-hour caching                        |
| `/api/assets/*` | Proxies to unpkg for Leaflet assets with 1-year immutable caching (strict CSP)       |
| `/api/health`   | System status check (connectivity to upstreams, version, env) with 60-second caching |

---

## Prohibited Changes

> **Do NOT add a "Skip to content" link.** This is a single-page application with only one view — there is no repeated navigation block to skip past. A "Skip to content" link serves no purpose here and should not be introduced.

---

## Known Limitations

1. **RainViewer Zoom Limit** - Free tier limits to zoom level 7 (Jan 2026). We use **512px tiles** with `zoomOffset: -1` and `maxNativeZoom: 8` to emulate higher resolution while reducing requests.
2. **Radar Opacity** - Tiles must be added with small opacity (0.01) initially to trigger loading.
3. **F1 API Rate Limits** - Edge caching via Worker mitigates this.
4. **Current Weather Rate Limits** - The live current weather widget triggers an Open-Meteo API call per circuit change, which may hit 429 rate limits during high traffic.

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
