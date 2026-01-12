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
| RainViewer | Weather radar tiles | No |
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

---

## Known Limitations

1. **RainViewer Zoom Limit** - Free tier limits to zoom level 10. Use `maxNativeZoom: 10` to upscale tiles at higher zooms.
2. **Radar Opacity** - Tiles must be added with small opacity (0.01) initially to trigger loading.
3. **F1 API Rate Limits** - Edge caching via Worker mitigates this.

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

## Local Development

```bash
# Recommended: Use Wrangler (supports SPA routing + Worker)
npx wrangler dev

# Alternative: Use serve with SPA mode (-s flag)
npx serve public -s -l 3000

# Open browser
# http://localhost:3000
```

Note: Use `wrangler dev` for full SPA routing support (URL sharing, page refresh). The `-s` flag with `serve` enables single-page-app fallback mode. Avoid `python -m http.server` as it doesn't support SPA routing.

Note: Local development fetches F1 data directly from Jolpica API. In production, it goes through the Worker proxy with caching.
