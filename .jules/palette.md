# Palette's Journal 🎨

## 2024-05-22 - [Initial Setup]
**Learning:** This project uses vanilla HTML/CSS/JS with no build step for the frontend, but uses Cloudflare Workers for the backend. This means verification requires a simple HTTP server or `wrangler dev`.
**Action:** When verifying changes, I will use `python3 -m http.server` to serve the `public` directory or rely on Playwright with a local server.

## 2024-05-22 - [Accessibility in Maps]
**Learning:** Leaflet maps can be tricky for accessibility. The map container should have a label, and interactive elements within it (like custom controls) need proper keyboard focus management.
**Action:** Always check keyboard navigation within the map area and ensure custom controls (like the radar playback) are focusable and have ARIA labels.
