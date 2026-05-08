# Circuit Weather 🌧️🏎️

**➡️ Live site: https://circuit-weather.racing**

[![License](https://img.shields.io/github/license/circuit-weather/circuit-weather)](LICENSE)
![JavaScript](https://img.shields.io/badge/-JavaScript-F7DF1E)
![HTML](https://img.shields.io/badge/-HTML-E34F26)
![CSS](https://img.shields.io/badge/-CSS-1572B6)

Circuit Weather is a real-time weather radar designed specifically for Formula 1 fans. It lets you track live precipitation and weather conditions at every circuit on the F1 calendar, helping you stay ahead of the strategy during race weekends.

This web app is completely and unashamedly vibe coded primarily using Google antigravity, Google Jules, and OpenCode. I have switched models between the latest versions of Google Gemini, Anthropic Opus and Sonnet, and OpenAI's GPT, and tested some minor models like Kimi K2 and K2.5, and Mistral. The site serves as an exploration into the capabilities of these technologies entirely for fun.

## What it does

The site provides a live weather radar overlay on top of the circuit map. You can see past weather movement and a short-term forecast to predict if rain is incoming. It automatically loads the schedule for the current F1 season, allowing you to jump between different rounds and sessions (like Qualifying or the Race).

Key features include:

- **Live Radar:** Visualise rain moving across the track with a 2-hour history.
- **Race Schedule:** Browse all circuits from the current F1 season with session start times.
- **Distance Markers:** Toggle range circles to gauge how far the rain is from the track (in km or miles).
- **Theme Support:** Automatically adapts to your system's dark or light mode, or you can toggle it manually.
- **Deep Linking:** Navigate directly to a specific race or session via the URL.
- **Weather Forecast:** View detailed, session-specific weather forecasts.
- **Multi-language Support:** Use the app in your preferred language.
- **Responsive Design:** Works great on your phone, tablet, or desktop.
- **Installable PWA:** Add to your home screen on mobile for a native app-like experience — no app store required.

## How it works

The application is built with vanilla HTML, CSS, and native ES modules, keeping it lightweight and fast. It uses Mapbox GL JS as the primary map renderer, falling back to Leaflet.js for interactive maps.

The frontend is organised into small, maintainable modules located in `public/src/`. It uses native browser support for ES modules (`import`/`export`), which means there is **no build step** required. The files are served directly as-is, making the development workflow extremely simple.

External API and asset requests (Jolpica F1, RainViewer, GitHub for track layouts, Unpkg for Leaflet assets, and Mapbox CDN for Mapbox GL JS assets) are proxied through a **Cloudflare Worker** to cache data at the edge, enforce strict Content Security Policy (CSP), and protect user privacy. Weather forecasts are fetched directly from Open-Meteo by the client to ensure reliability. Optimised **512px tile caching** is used to reduce request volume by 75% compared to standard implementations.

The primary map tiles and rendering are provided by Mapbox. When falling back to Leaflet, map tiles are provided by Carto (based on OpenStreetMap data), ensuring a clean look that works well with the weather overlays.

## Credits

Huge thanks to the free APIs and data sources that make this possible:

- **[Jolpica F1](https://jolpi.ca/)** for the race data.
- **[RainViewer](https://www.rainviewer.com/)** for the weather radar.
- **[Open-Meteo](https://open-meteo.com/)** for the weather forecasts.
- **[Mapbox](https://www.mapbox.com/)** for the primary map rendering and tiles.
- **[Carto](https://carto.com/)** & **[OpenStreetMap](https://www.openstreetmap.org/)** for the fallback map tiles.
- **[bacinger/f1-circuits](https://github.com/bacinger/f1-circuits)** for the circuit track data.
- **[Google Fonts](https://fonts.google.com/)** for the typography.
- **[FlagCDN](https://flagcdn.com/)** for the country flags.
- **[Buy Me a Coffee](https://www.buymeacoffee.com/)** for the support widget.

## License

MIT License - see [LICENSE](LICENSE) for details.
