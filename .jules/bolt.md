# BOLT'S JOURNAL

## 2024-05-22 - Weather Forecast Redundancy
**Learning:** The application architecture re-fetches identical 16-day forecast data from Open-Meteo when switching between sessions (FP1, FP2, etc.) of the same Grand Prix. Since the location is identical and the forecast window is large (16 days), these requests are redundant.
**Action:** Implemented client-side caching in `WeatherClient` keyed by `lat,lon` with a 15-minute TTL to share the raw forecast data across session selections.

## 2025-01-15 - Redundant Track Data Fetching
**Learning:** The application was re-fetching static GeoJSON track files every time a circuit was selected, even if previously visited. This caused unnecessary network requests for immutable data.
**Action:** Implemented a simple memory cache in `TrackLayer` to store and reuse GeoJSON data, reducing network load and improving responsiveness during navigation.
