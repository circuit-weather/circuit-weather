# Privacy Policy

**Last updated:** October 2026

## Overview

Circuit Weather is an open-source web application that displays real-time weather radar for Formula 1 race circuits. We are committed to transparency regarding how our application operates and how your data is handled.

## Data Collection

**Circuit Weather itself does not collect, store, or process any personal data.**

- No user accounts or registration.
- No internal tracking or analytics.
- No database of user information.

However, the application relies on third-party services and infrastructure which may process standard web request data (such as your IP address and User Agent) to function.

## Infrastructure and Caching

### Cloudflare

This website is hosted on **Cloudflare Workers** (using Static Assets) which serves both the website and powers its API.

- **Privacy proxy:** Requests for F1 schedules, track layouts, Leaflet assets, Mapbox GL JS assets, and all radar tiles and weather warnings (LibreWXR, with RainViewer as a backup) are proxied through our Cloudflare Worker.
- **Advanced caching:** API responses are cached at the edge to minimise bandwidth use and upstream load.
- **Data processed:** Cloudflare processes IP address and request metadata to deliver and protect the site.
- **Privacy policy:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Third-Party Services

Your browser may connect directly to third-party services for maps, tiles, and widgets.

### Schedule Data

**OpenF1**

- **Purpose:** Provides fallback F1 schedule data when the primary provider is unavailable.
- **Data sent:** Your browser connects directly to the OpenF1 API. Your IP address is visible to OpenF1 as part of this standard web request.
- **Privacy policy:** [openf1.org](https://openf1.org/)

### Weather Data

**Open-Meteo**

- **Purpose:** Session weather forecasts.
- **Data sent:** IP address (standard web request) and selected circuit coordinates.
- **Privacy policy:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**LibreWXR**

- **Purpose:** Primary source for precipitation radar, the 1-hour rain forecast, satellite clouds, lightning, storm cells and official weather warnings.
- **Data sent:** None directly. Requests are proxied through our Worker, which sends LibreWXR only the rounded coordinates of the selected circuit (for weather warnings).
- **Privacy policy:** [librewxr.net](https://librewxr.net/)

**RainViewer**

- **Purpose:** Backup radar layers, used only when LibreWXR is unavailable.
- **Data sent:** None directly. Radar data is proxied through our Worker.
- **Privacy policy:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mapping and Assets

**Mapbox**

- **Purpose:** Provides the primary map background tiles and vector rendering.
- **Data sent:** Your browser connects directly to Mapbox APIs (`api.mapbox.com` and `events.mapbox.com`). Your IP address and request metadata are visible to Mapbox as part of standard web requests.
- **Privacy policy:** [mapbox.com/legal/privacy](https://www.mapbox.com/legal/privacy/)

**Carto (OpenStreetMap)**

- **Purpose:** Basemap tiles.
- **Data sent:** Your browser requests map images directly from Carto.
- **Privacy policy:** [carto.com/privacy](https://carto.com/privacy/)

**Public CDNs**

- **Google Fonts:** Typography assets.
- **FlagCDN:** Country flag icons.

### Community and Support

**Buy Me a Coffee**

- **Purpose:** Optional donations.
- **Data sent:** If used, cookies and payment/session data may be processed by Buy Me a Coffee.
- **Privacy policy:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

### Data Sources (Proxied)

- **Jolpica F1:** F1 schedule data (24-hour edge cache; a last-known-good copy is kept for up to 30 days as a fallback if the source is unavailable).
- **TheSportsDB:** Formula 2, Formula 3 and Formula E schedule and circuit data (refreshed between hourly and monthly depending on how close each round is; the last fetched copy is kept for up to 180 days as a fallback).
- **GitHub (bacinger/f1-circuits):** GeoJSON track files (24-hour edge cache).
- **LibreWXR:** Radar metadata (1-minute cache), radar tiles (2-hour edge cache; forecast tiles 5 minutes), satellite tiles (12-hour edge cache) and weather warnings (5-minute cache). Short-lived backup copies of the metadata (30 minutes) and warnings (1 hour) are kept in case LibreWXR is unavailable.
- **RainViewer:** Radar metadata (1-minute cache) and tiles (2-hour edge cache).
- **Leaflet (via Unpkg):** Map interaction library assets (proxied for security, 1-year immutable cache).
- **Mapbox (via Mapbox CDN):** Map interaction library assets (proxied for security, 1-year immutable cache).

## Local Storage

Preference settings are stored locally in your browser:

- **theme:** `light` or `dark`
- **unit:** `metric` or `imperial`
- **language:** your selected locale (e.g., `en-GB`, `fr`)
- **windOverlay:** `true` or `false` (remembers if the wind animation layer is enabled)
- **radarColour:** the selected radar colour scheme number
- **radarArrows, radarCells, radarLightning, radarSatellite:** `true` or `false` (remembers which extra radar layers are enabled)
- **weatherAlerts:** `true` or `false` (remembers if weather warnings are shown)
- **f1_schedule_cache:** caches the F1 schedule data (7-day cache)
- **series_schedule_cache:** caches the Formula 2, Formula 3 and Formula E schedule data (7-day cache; 5 minutes while the schedule is still loading)

This data remains on your device and is not sent to our servers.

## Open Source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contact

For privacy questions, please open an issue on GitHub.
