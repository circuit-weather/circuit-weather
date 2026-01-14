# BOLT'S JOURNAL

## 2024-05-22 - Weather Forecast Redundancy
**Learning:** The application architecture re-fetches identical 16-day forecast data from Open-Meteo when switching between sessions (FP1, FP2, etc.) of the same Grand Prix. Since the location is identical and the forecast window is large (16 days), these requests are redundant.
**Action:** Implemented client-side caching in `WeatherClient` keyed by `lat,lon` with a 15-minute TTL to share the raw forecast data across session selections.
