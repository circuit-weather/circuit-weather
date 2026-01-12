# Circuit Weather 🌧️🏎️

Real-time weather radar for Formula 1 race circuits.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **Live Weather Radar** - Animated precipitation overlay with 2-hour history and 30-minute forecast
- **All 2026 F1 Circuits** - Automatic coordinates from official schedule data
- **Range Circles** - Visual distance indicators (metric/imperial toggle)
- **Dark/Light Mode** - Automatic system detection with manual override
- **Shareable URLs** - Direct links to specific races and sessions (e.g., `/f1/8/qualifying`)
- **Fully Responsive** - Optimized for mobile, tablet, and desktop
- **No API Keys Required** - All data sources are free and open

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Maps | [Leaflet.js](https://leafletjs.com/) |
| Map Tiles | [OpenFreeMap](https://openfreemap.org/) |
| Weather Radar | [RainViewer API](https://www.rainviewer.com/api.html) |
| F1 Data | [Jolpica F1 API](https://github.com/jolpica/jolpica-f1) |
| Hosting | [Cloudflare Pages](https://pages.cloudflare.com/) |
| Edge Caching | Cloudflare Pages Functions |

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/circuit-weather.git
   cd circuit-weather
   ```

2. Start a local server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Or using Node.js
   npx serve
   
   # Or using Wrangler (for full Cloudflare Functions support)
   npx wrangler pages dev .
   ```

3. Open http://localhost:8000 in your browser

## Project Structure

```
circuit-weather/
├── index.html          # Main HTML
├── styles.css          # Design system & responsive styles
├── app.js              # Application logic
├── functions/          # Cloudflare Pages Functions
│   └── api/f1/
│       └── [[path]].js # F1 API proxy with edge caching
├── PRIVACY.md          # Privacy policy
├── LICENSE             # MIT License
└── README.md           # This file
```

## API Credits

This project is made possible by these fantastic free APIs:

- **[Jolpica F1](https://github.com/jolpica/jolpica-f1)** - Open-source F1 data API (Ergast replacement)
- **[RainViewer](https://www.rainviewer.com/)** - Global weather radar data
- **[OpenFreeMap](https://openfreemap.org/)** - Free OpenStreetMap tiles

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.
