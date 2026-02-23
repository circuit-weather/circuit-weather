# Circuit Weather 🌧️🏎️

**➡️ Live site: https://circuit-weather.racing**

[![License](https://img.shields.io/github/license/circuit-weather/circuit-weather)](LICENSE)
![JavaScript](https://img.shields.io/badge/-JavaScript-F7DF1E)
![HTML](https://img.shields.io/badge/-HTML-E34F26)
![CSS](https://img.shields.io/badge/-CSS-1572B6)

Circuit Weather is a real-time weather radar designed specifically for Formula 1 fans. It lets you track live precipitation and weather conditions at every circuit on the F1 calendar, helping you stay ahead of the strategy during race weekends.

This web app is completely and unashamedly vibe coded primarily with the use of Google antigravity and Google Jules, using anthropic opus 4.5 and 4.6 and Google Gemini 3. It serves as an exploration into the capabilities of these technologies, as well as a test of open-source coding tools for performance and efficiency.

## What it does

The site provides a live weather radar overlay on top of the circuit map. You can see past weather movement and a short-term forecast to predict if rain is incoming. It automatically loads the schedule for the current F1 season, allowing you to jump between different rounds and sessions (like Qualifying or the Race).

Key features include:
*   **Live Radar:** Visualise rain moving across the track with a 2-hour history.
*   **Race Schedule:** Browse all circuits from the current F1 season with session start times.
*   **Distance Markers:** Toggle range circles to gauge how far the rain is from the track (in km or miles).
*   **Theme Support:** Automatically adapts to your system's dark or light mode, or you can toggle it manually.
*   **Deep Linking:** Navigate directly to a specific race or session via the URL.
*   **Responsive Design:** Works great on your phone, tablet, or desktop.
*   **Installable PWA:** Add to your home screen on mobile for a native app-like experience — no app store required.

## How it works

The application is built with vanilla HTML, CSS, and native ES modules, keeping it lightweight and fast. It uses Leaflet.js for interesting interactive maps.

The frontend is organised into small, maintainable modules located in `public/src/`. It uses native browser support for ES modules (`import`/`export`), which means there is **no build step** required. The files are served directly as-is, making the development workflow extremely simple.

All API requests (Jolpica F1, RainViewer) are proxied through a **Cloudflare Worker** to cache data at the edge and protect user privacy. Weather forecasts are fetched directly from Open-Meteo by the client to ensure reliability. Optimised **512px tile caching** is used to reduce request volume by 75% compared to standard implementations.

The map tiles are provided by Carto (based on OpenStreetMap data), ensuring a clean look that works well with the weather overlays.


## Credits

Huge thanks to the free APIs and data sources that make this possible:
*   **Jolpica F1** for the race data.
*   **RainViewer** for the weather radar.
*   **Open-Meteo** for the weather forecasts.
*   **Carto & OpenStreetMap** for the map tiles.
*   **bacinger/f1-circuits** for the circuit track data.

## Development

To run the project locally:

```bash
npm install
npm run dev
```

For more details, see [AGENTS.md](AGENTS.md).

## License

MIT License - see [LICENSE](LICENSE) for details.
