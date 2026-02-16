## 2026-02-16 - [Dynamic Theme Color for Mobile Browsers]
**Learning:** Users perceive a "native app" feel when the mobile browser's address bar matches the application's theme. Static `theme-color` meta tags create a jarring mismatch in dark mode. Updating this meta tag dynamically via JS (both on init and toggle) is a low-effort, high-impact polish.
**Action:** When implementing dark mode support in future web apps, always include logic to synchronize the `<meta name="theme-color">` tag with the active theme state.
