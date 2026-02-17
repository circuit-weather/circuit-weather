# AGENTS.md - Circuit Weather Project Specification

## Overview

Circuit Weather is a real-time F1 race circuit weather radar application. It displays live weather radar overlays on maps of F1 circuits to help viewers understand weather conditions during race weekends.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla HTML/CSS/JS |
| Mapping | Leaflet.js with Carto basemaps |
| Backend | Cloudflare Workers with Assets |
| APIs | Jolpica F1 API, RainViewer API |

---

## Security Requirements

### API Keys & Secrets
- **NO API keys in frontend code** - All external APIs used are free/keyless
- **NO sensitive data in git** - `.gitignore` excludes `.env*`, `.wrangler/`
- **NO user authentication** - App is read-only, no user accounts

### Third-Party Services
| Service | Purpose | Auth Required |
|---------|---------|---------------|
| Jolpica F1 API | Race schedule data | No |
| RainViewer | Weather radar tiles | Proxied (Cached) |
| Open-Meteo | Weather forecasts | Direct (Client-side) |
| Carto | Map basemap tiles | No |

### Data Handling
- **No cookies** used
- **localStorage only** for theme/unit preferences
- **No PII collected** - See PRIVACY.md

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
│   ├── app.js
│   ├── theme.js      # Critical for FOUC prevention (load in head)
│   ├── favicon.svg
│   ├── icon-192.png  # PWA icon (192×192)
│   ├── icon-512.png  # PWA icon (512×512)
│   ├── manifest.json # PWA web app manifest
│   ├── sw.js         # Service worker (app shell caching)
│   ├── _headers      # Cloudflare Pages custom headers (CSP, security)
│   └── PRIVACY.md
├── src/
│   └── worker.js     # Cloudflare Worker (API proxy + asset serving)
├── .jules/           # Jules AI agent config (MUST be lowercase)
├── wrangler.toml     # Cloudflare config
├── README.md
└── LICENSE
```

> **Important for Jules**: The `.jules` directory must **always** be lowercase (`.jules`, not `.Jules`). GitHub runs on Linux (case-sensitive), and creating `.Jules` alongside `.jules` causes conflicts on Windows/macOS (case-insensitive). Always use `.jules` with a lowercase `j`.

### Image Assets

| File | Format | Size | Purpose | Source |
|------|--------|------|---------|--------|
| `favicon.svg` | SVG | 24×24 viewBox | Browser tab icon | Hand-authored (red rounded rect + white F1 flag) |
| `icon-192.png` | PNG | 192×192 px | PWA icon (Android install, Apple touch icon) | Generated from `favicon.svg` |
| `icon-512.png` | PNG | 512×512 px | PWA splash screen / maskable icon | Generated from `favicon.svg` |

**Regenerating icons**: If `favicon.svg` is updated, regenerate the PNGs at 192×192 and 512×512 using any SVG-to-PNG converter (e.g. `cairosvg`, Inkscape, or Pillow with manual drawing). The icons must visually match the favicon design.

### Build & Deploy
```bash
# Local development
npx wrangler dev

# Deploy to Cloudflare
# Deployment is automatic via Cloudflare Pages integration when changes are merged to the 'main' branch.
# See "Git Workflow for Changes" below.
```

**Note**: The project is connected to Cloudflare Pages via GitHub integration. Pushing to `main` triggers automatic deployment - no manual `wrangler deploy` needed.

### Git Workflow for Changes

All code changes must follow this workflow:

1. **Create a new branch** from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** on the new branch

3. **Commit and push** to the repository:
   ```bash
   git add .
   git commit -m "Brief description of changes"
   git push origin feature/your-feature-name
   ```

4. **Open a Pull Request** on GitHub with:
   - A clear, descriptive title
   - A well-constructed description that includes:
     - What changes were made and why
     - Any relevant context or background
     - Testing performed
     - Screenshots (if UI changes)

> **Important**: Direct pushes to `main` should be avoided. All changes should go through the PR review process.

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
- No environment variables required
- No build step required (vanilla JS)

---

## Functionality Requirements

### Core Features

1. **Series/Round/Session Selection**
   - Series dropdown (F1 only currently)
   - Round dropdown shows all races in current season with dates
   - Session dropdown shows FP1-3, Sprint/Qualifying/Race with times

2. **Map Display**
   - Centered on selected circuit
   - Dark/light mode basemaps (Carto)
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
   - Shows "NOW" when session is live

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

### UI Layout

```
┌─────────────────────────────────────────┐
│ Header: Logo + Theme Toggle             │
├──────────┬──────────────────────────────┤
│ Sidebar  │                              │
│ - Series │           MAP                │
│ - Round  │    (with radar overlay)      │
│ - Session│                              │
│ - Units  │                              │
│          │                              │
│ Countdown├──────────────────────────────│
│          │  Radar Controls (play/seek)  │
│ Forecast │                              │
├──────────┴──────────────────────────────│
│ Footer: Privacy | GitHub                │
└─────────────────────────────────────────┘
```

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/f1/*` | Proxies to Jolpica F1 API with 1-hour edge caching |
| `/api/radar` | Proxies to RainViewer Maps API with 1-minute caching (initializes animation) |
| `/api/tiles/*` | Proxies to RainViewer tile API with 2-hour edge caching (512px optimized) |
| `/api/track/*` | Proxies to GitHub for GeoJSON track data with 24-hour caching |
| `/api/assets/*` | Proxies to unpkg for Leaflet assets with 1-year immutable caching (strict CSP) |

---

## Prohibited Changes

> **Do NOT add a "Skip to content" link.** This is a single-page application with only one view — there is no repeated navigation block to skip past. A "Skip to content" link serves no purpose here and should not be introduced.

---

## Known Limitations

1. **RainViewer Zoom Limit** - Free tier limits to zoom level 10. We use **512px tiles** with `zoomOffset: -1` and `maxNativeZoom: 8` to emulate higher resolution while reducing requests.
2. **Radar Opacity** - Tiles must be added with small opacity (0.01) initially to trigger loading.
3. **F1 API Rate Limits** - Edge caching via Worker mitigates this.
4. **Current Weather Rate Limits** - The live current weather widget is enabled via `FEATURE_FLAGS.enableCurrentWeather` in `app.js`, but be aware that it triggers an Open-Meteo API call per circuit change which may hit 429 rate limits during high traffic.

---

## Testing Checklist

- [ ] Map tiles load on initial page load
- [ ] Radar tiles visible at circuit zoom level
- [ ] Radar animation plays/pauses correctly
- [ ] Countdown displays correct time to session
- [ ] Theme toggle updates map tiles
- [ ] Unit toggle updates range circles
- [ ] URL routing works (/f1/1/race)
- [ ] Browser back/forward navigation works
- [ ] Mobile responsive layout

---

## Test & Verification File Policy

> **Important**: Do NOT persist one-off test scripts, verification files, or debug artifacts in the project.

### Rules

1. **No ad-hoc test files** - Scripts like `verify_*.py`, `test_*.js`, or similar should not be committed
2. **No screenshots or artifacts** - Files like `verification.png`, `debug_output.txt`, etc. must be deleted after use
3. **Clean up after yourself** - If you create temporary files for testing, remove them before completing your task
4. **Use proper test locations** - If persistent tests are needed, discuss with the user about proper test infrastructure

### If You Find Orphaned Test Files

If you discover files that appear to be one-off agent tests (e.g., standalone verification scripts not referenced anywhere), flag them to the user for removal.

---

## Local Development

```bash
npx wrangler dev
# Opens at http://127.0.0.1:8787
```

### Notes
- This runs the full Cloudflare Worker + static assets locally, faithfully reproducing the production environment
- All API routes (`/api/f1/*`, `/api/radar`, `/api/tiles/*`, `/api/track/*`) are handled by the local worker proxy
- Deployment to Cloudflare is automatic via GitHub push to `main`

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

