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

## Infrastructure & Caching

### Cloudflare
This website is hosted on **Cloudflare Pages** and utilizes **Cloudflare Workers** to power its API. We leverage Cloudflare's global edge network to aggressively cache data close to you.

- **Privacy Proxy:** To enhance your privacy, requests for F1 schedules (Jolpica), Track Layouts (GitHub), and Weather Radar metadata (RainViewer) are proxied through our Cloudflare Worker. This means the upstream API providers see Cloudflare's IP address rather than yours for these specific requests.
- **Advanced Caching:** We utilize advanced edge caching features to store API responses on Cloudflare's servers. This minimizes data usage and reduces load on the open-source community APIs we rely on.
- **Data Processed:** Cloudflare processes your IP address and request metadata to deliver the website and protect against security threats.
- **Privacy Policy:** [cloudflare.com/privacypolicy](https://www.cloudflare.com/privacypolicy/)

## Third-Party Services

While we proxy some data, your browser connects directly to the following services to render maps, tiles, and widgets. These services receive standard web request data (IP address, User Agent).

### Weather Data

**Open-Meteo**
- **Purpose:** Provides detailed weather forecasts for race sessions.
- **Data Sent:** Your browser connects directly to Open-Meteo API. Coordinates of the selected circuit are sent to fetch local weather.
- **Privacy Policy:** [open-meteo.com/en/features#terms](https://open-meteo.com/en/features#terms)

**RainViewer**
- **Purpose:** Provides precipitation radar layers.
- **Data Sent:** While radar *metadata* is proxied to protect your privacy, the actual *radar map tiles* (images) are fetched directly by your browser from RainViewer's tile servers.
- **Privacy Policy:** [rainviewer.com/privacy](https://www.rainviewer.com/privacy.html)

### Mapping & Assets

**Carto (OpenStreetMap)**
- **Purpose:** Provides the base map background tiles.
- **Data Sent:** Your browser fetches map images directly from Carto's CDN.
- **Privacy Policy:** [carto.com/privacy](https://carto.com/privacy/)

**Content Delivery Networks (CDNs)**
To improve performance and reliability, we load standard libraries and assets from public CDNs:
- **Unpkg:** Serves the Leaflet.js mapping library.
- **Google Fonts:** Serves typography files.
- **FlagCDN:** Serves country flag icons.

### Community & Support

**Buy Me a Coffee**
- **Purpose:** Allows users to support the project via donations.
- **Data Sent:** If you interact with the support widget, Buy Me a Coffee may place cookies and collect data necessary to process payments or maintain the session.
- **Privacy Policy:** [buymeacoffee.com/privacy-policy](https://www.buymeacoffee.com/privacy-policy)

### Data Sources (Proxied)

The following services provide the raw data that we process and cache via Cloudflare. Your device does not connect to them directly for data API calls.

- **Jolpica F1:** Historical and current F1 schedule data.
- **GitHub:** Stores static track layout files (GeoJSON).

## Local Storage

The application stores preference settings locally in your browser to remember your choices between visits:

- **theme:** `light` or `dark`
- **unit:** `metric` or `imperial`

This data resides solely on your device and is never transmitted to our servers.

## Open Source

This project is open source. You can review our entire codebase to verify these claims:
[github.com/circuit-weather/circuit-weather](https://github.com/circuit-weather/circuit-weather)

## Contact

For privacy-related questions or to report concerns, please open an issue on our GitHub repository.
