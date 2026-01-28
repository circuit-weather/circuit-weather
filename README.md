# Circuit Weather 🌧️🏎️

**➡️ Live site: https://circuit-weather.racing**

[![License](https://img.shields.io/github/license/circuit-weather/circuit-weather)](LICENSE)
![JavaScript](https://img.shields.io/badge/-JavaScript-F7DF1E)
![HTML](https://img.shields.io/badge/-HTML-E34F26)
![CSS](https://img.shields.io/badge/-CSS-1572B6)

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

> **Note:** These instructions are for developers who want to contribute to the project. If you just want to use the site, please visit the live version at **https://circuit-weather.racing**.

This project uses [Cloudflare Workers](https://workers.cloudflare.com/) to proxy API requests, so a simple static web server is not enough. You'll need to use the `wrangler` CLI to run it locally.

1.  **Clone the repository.**
2.  **Install Node.js and Wrangler.**
    If you don't have Node.js installed, download it from [nodejs.org](https://nodejs.org/). Then, install the Wrangler CLI globally:
    ```bash
    npm install -g wrangler
    ```
3.  **Start the local development server.**
    Run the following command in your terminal at the root of the project:
    ```bash
    wrangler dev
    ```
4.  **Open the local address in your browser.**
    Wrangler will typically open the site at `http://localhost:8787`.

This setup faithfully reproduces the production environment, running both the frontend and the worker for API requests.

## Compatibility

**ARM Architecture:** Please note that the `wrangler` CLI, which is required for local development, does not currently support ARM-based systems like the Raspberry Pi. You may encounter an `Unsupported platform` error during installation. Development should be done on an x86/x64-based machine.

## Credits

Huge thanks to the free APIs that make this possible:
*   **Jolpica F1** for the race data.
*   **RainViewer** for the weather radar.
*   **Carto & OpenStreetMap** for the map tiles.

## License

MIT License - see [LICENSE](LICENSE) for details.
