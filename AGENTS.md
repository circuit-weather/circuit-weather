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
| Open-Meteo | Weather forecasts | No |
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
│   └── PRIVACY.md
├── src/
│   └── worker.js     # Cloudflare Worker (API proxy + asset serving)
├── wrangler.toml     # Cloudflare config
├── README.md
└── LICENSE
```

### Build & Deploy
```bash
# Local development
npx wrangler dev

# Deploy to Cloudflare (auto-deploys on push to GitHub)
git add .
git commit -m "Your changes"
git push origin main
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

[assets]
directory = "./public"
binding = "ASSETS"
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
   - Range circles (outline only) at 5/10/25/50 km or 3/6/15/30 mi
   - Distance labels on circles

3. **Weather Radar**
   - Live radar tiles from RainViewer
   - Animated playback with play/pause
   - Timeline slider
   - Session-relative time display ("5m before", "10m after")
   - Must handle RainViewer's zoom limit (maxNativeZoom: 10)

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
| `/api/tiles/*` | Proxies to RainViewer tile API with 2-hour edge caching (512px optimized) |

---

## Known Limitations

1. **RainViewer Zoom Limit** - Free tier limits to zoom level 10. We use **512px tiles** with `zoomOffset: -1` and `maxNativeZoom: 8` to emulate higher resolution while reducing requests.
2. **Radar Opacity** - Tiles must be added with small opacity (0.01) initially to trigger loading.
3. **F1 API Rate Limits** - Edge caching via Worker mitigates this.
4. **Current Weather Disabled** - The live current weather widget is disabled via `FEATURE_FLAGS.enableCurrentWeather` in `app.js` to reduce Open-Meteo API calls (429 rate limiting). Session forecasts still work. Re-enable by setting the flag to `true`.

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
python -m http.server 8000 --directory public
# Opens at http://localhost:8000
```

### Notes
- This serves the static frontend files directly for quick testing
- F1 data fetches go directly to the Jolpica API (no Worker proxy locally)
- Deployment to Cloudflare handles the Worker/API proxy automatically via GitHub push


