# Privacy Policy

**Last updated:** January 2026

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

This website is hosted on **Cloudflare Workers** (using Static Assets), which serves both the website and powers its API.

- **Privacy proxy:** Requests for F1 schedules, track layouts, Leaflet assets, and all RainViewer radar tiles are proxied through our Cloudflare Worker.
- **Advanced caching:** API responses are cached at the edge to minimize bandwidth usage and upstream load.
- **Data processed:** Cloudflare processes IP address and request metadata to deliver and protect the site.
- **Privacy policy:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Third-Party Services

Your browser may connect directly to third-party services for maps, tiles, and widgets.

### Weather Data

**Open-Meteo**

- **Purpose:** Session weather forecasts.
- **Data sent:** IP address (standard web request) and selected circuit coordinates.
- **Privacy policy:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**

- **Purpose:** Radar layers.
- **Data sent:** None directly. Radar data is proxied through our Worker.
- **Privacy policy:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mapping and Assets

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

- **Jolpica F1:** F1 schedule data.
- **GitHub (bacinger/f1-circuits):** GeoJSON track files.
- **RainViewer:** Radar metadata and tiles.
- **Leaflet (via Unpkg):** Map library assets.

## Local Storage

Preference settings are stored locally in your browser:

- **theme:** `light` or `dark`
- **unit:** `metric` or `imperial`
- **language:** your selected locale (e.g., `en-GB`, `fr`)
- **f1_schedule_cache:** caches the F1 schedule data (24-hour cache)

This data remains on your device and is not sent to our servers.

## Open Source

[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contact

For privacy questions, please open an issue on GitHub.
