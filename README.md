# Circuit Weather 🌧️🏎️

[![License](https://img.shields.io/github/license/circuit-weather/circuit-weather)](LICENSE)
![Top Language](https://img.shields.io/github/languages/top/circuit-weather/circuit-weather)

Circuit Weather is a real-time weather radar designed specifically for Formula 1 fans. It lets you track live precipitation and weather conditions at every circuit on the F1 calendar, helping you stay ahead of the strategy during race weekends.

This web app is completely and unashamedly vibe coded primarily with the use of Google antigravity and Google Jules, using anthropic opus 4.5 and Google Gemini 3. I created it as an exercise to investigate their capabilities and see how it goes.

## What it does

The site provides a live weather radar overlay on top of the circuit map. You can see past weather movement and a short-term forecast to predict if rain is incoming. It automatically loads the schedule for the current F1 season, allowing you to jump between different rounds and sessions (like Qualifying or the Race).

Key features include:
*   **Live Radar:** Visualise rain moving across the track with a 2-hour history and 30-minute forecast.
*   **Race Schedule:** Browse all circuits from the current F1 season with session start times.
*   **Distance Markers:** Toggle range circles to gauge how far the rain is from the track (in km or miles).
*   **Theme Support:** Automatically adapts to your system's dark or light mode, or you can toggle it manually.
*   **Shareable Links:** Send a direct link to a specific race or session to your friends.
*   **Responsive Design:** Works great on your phone, tablet, or desktop.

## How it works

The application is built with vanilla HTML, CSS, and JavaScript, keeping it lightweight and fast. It uses Leaflet.js for the interactive maps and fetches weather data from the RainViewer API. Race schedules and circuit locations are sourced from the Jolpica F1 API (an open-source alternative to Ergast).

The map tiles are provided by Carto (based on OpenStreetMap data), ensuring a clean look that works well with the weather overlays.

## Running it locally

If you want to run this project on your own machine:

1.  Clone the repository.
2.  Start a simple local web server (e.g., `npx serve` or `python -m http.server`).
3.  Open the local address in your browser.

No API keys are required as all data sources are free and open.

## Credits

Huge thanks to the free APIs that make this possible:
*   **Jolpica F1** for the race data.
*   **RainViewer** for the weather radar.
*   **Carto & OpenStreetMap** for the map tiles.

## License

MIT License - see [LICENSE](LICENSE) for details.
