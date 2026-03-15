import { CONFIG } from '../config.js';

export class WeatherClient {
    constructor() {
        this.baseUrl = CONFIG.weatherApi;
        // TODO: This in-memory cache implementation requires further investigation and confirmation.
        // The current implementation uses a plain JavaScript Map with no maximum size limit or eviction
        // policy. As users browse different circuits across the F1 season, each unique coordinate pair
        // creates a new cache entry that is never removed. Over time, this could lead to unbounded
        // memory growth in long-running sessions, potentially degrading performance or causing memory
        // issues on devices with limited resources. Consider implementing an LRU (Least Recently Used)
        // eviction strategy with a maximum cache size (for example, 50 entries) to prevent excessive
        // memory usage. Additionally, the cache entries are only keyed by rounded coordinates and do
        // not account for different forecast times, which could lead to stale data being served
        // if the same location is queried for different session times.
        this.cache = new Map();
        this.cacheTTL = 15 * 60 * 1000; // 15 minutes
    }

    async getForecast(lat, lon, sessionTime) {
        // Check if session is too far in future (> 10 days)
        // Open-Meteo free tier goes up to 14-16 days but accuracy drops
        const now = new Date();
        const diffDays = (sessionTime - now) / (1000 * 60 * 60 * 24);

        if (diffDays > 16) {
            // Palette UX: Calculate when the forecast will become available
            // Open-Meteo offers ~14-16 days forecast. We use 16 for safety.
            const availableFrom = new Date(sessionTime.getTime() - (16 * 24 * 60 * 60 * 1000));
            return { available: false, reason: 'too_far', availableFrom };
        }

        try {
            // Check cache
            // Bolt Optimization: Round coordinates to increase cache hit rate during map panning
            // 2 decimal places is approx 1.1km, sufficient for general weather accuracy
            const rLat = Number(lat).toFixed(2);
            const rLon = Number(lon).toFixed(2);
            const cacheKey = `${rLat},${rLon}`;
            let data;

            if (this.cache.has(cacheKey)) {
                const entry = this.cache.get(cacheKey);
                if (Date.now() - entry.timestamp < this.cacheTTL) {
                    data = entry.data;
                }
            }

            if (!data) {
                // Bolt Optimization: Use rounded coordinates in URL to improve browser cache hit rate
                // Direct call to Open-Meteo (Client-side)
                const params = new URLSearchParams({
                    latitude: rLat,
                    longitude: rLon,
                    hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code',
                    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,precipitation_probability',
                    timeformat: 'unixtime',
                    forecast_days: '16',
                    timezone: 'auto'
                });
                const url = `${this.baseUrl}?${params.toString()}`;

                const response = await fetch(url, {
                    signal: AbortSignal.timeout(5000)
                });
                if (!response.ok) throw new Error('Weather API error');

                data = await response.json();
                this.cache.set(cacheKey, { timestamp: Date.now(), data });
            }

            const hourlyFiltered = this.filterHourly(data.hourly, sessionTime);

            if (hourlyFiltered.length === 0) {
                // If there's no data for this specific time, it's either too far or an API gap
                const availableFrom = new Date(sessionTime.getTime() - (16 * 24 * 60 * 60 * 1000));
                return { available: false, reason: 'too_far', availableFrom };
            }

            return {
                available: true,
                current: data.current,
                hourly: hourlyFiltered,
                units: data.current_units
            };
        } catch (error) {
            console.error('Weather fetch failed:', error);
            return { available: false, reason: 'error' };
        }
    }

    filterHourly(hourly, sessionTime) {
        const sessionTs = Math.floor(sessionTime.getTime() / 1000);
        // Range: -1.5 hours to +3 hours relative to session start
        // Widened to 1.5h (5400s) to capture the "previous hour" data point for sessions starting at :30
        const startTs = sessionTs - 5400;
        const endTs = sessionTs + (3 * 3600);

        const result = [];
        const times = hourly.time;

        if (!times || times.length === 0) return result;

        // Destructure for faster access
        const {
            temperature_2m: temps,
            relative_humidity_2m: humids,
            precipitation_probability: precips,
            wind_speed_10m: winds,
            wind_direction_10m: windDirs,
            weather_code: codes
        } = hourly;

        // Bolt Optimization: Calculate start index directly (O(1)) instead of iterating from start (O(N))
        // Open-Meteo guarantees strictly sequential hourly intervals (3600s)
        const firstTime = times[0];
        let startIndex = Math.floor((startTs - firstTime) / 3600);
        // Clamp to valid range
        startIndex = Math.max(0, startIndex);

        for (let i = startIndex; i < times.length; i++) {
            const time = times[i];
            // Bolt Optimization: Stop iterating once we pass the end time
            if (time > endTs) break;

            if (time >= startTs) {
                result.push({
                    time: time,
                    temp: temps[i],
                    humidity: humids ? humids[i] : null,
                    precipProb: precips[i],
                    windSpeed: winds[i],
                    windDir: windDirs[i],
                    code: codes[i]
                });
            }
        }
        return result;
    }

    getWeatherDescription(code) {
        // WMO Weather interpretation codes (WW)
        // https://open-meteo.com/en/docs
        if (code === 0) return 'Clear sky';
        if (code <= 3) return 'Partly cloudy';
        if (code <= 48) return 'Fog';
        if (code <= 55) return 'Drizzle';
        if (code <= 67) return 'Rain';
        if (code <= 77) return 'Snow grains';
        if (code <= 82) return 'Rain showers';
        if (code <= 86) return 'Snow showers';
        if (code <= 99) return 'Thunderstorm';
        return 'Unknown';
    }

    getRelativeTime(timestamp, sessionTime) {
        // Bolt Optimization: Align logic to "Session Hour" for clean labels
        // 1. Get the session start hour (e.g., 14:30 -> 14:00)
        const sessionStartHour = new Date(sessionTime);
        sessionStartHour.setMinutes(0, 0, 0);

        // 2. Calculate hour difference from that anchor
        // Timestamp is in seconds, convert to ms
        const diffHours = (timestamp * 1000 - sessionStartHour.getTime()) / (1000 * 60 * 60);

        // 3. Round to nearest integer to handle any slight drifts (though usually exact)
        const roundedDiff = Math.round(diffHours);

        if (roundedDiff === 0) return 'Start';
        if (roundedDiff < 0) return `${roundedDiff}h`;
        return `+${roundedDiff}h`;
    }

    getAccessibleRelativeTime(timestamp, sessionTime) {
        const diffMins = (timestamp * 1000 - sessionTime.getTime()) / 60000;

        if (Math.abs(diffMins) < 30) return 'Session start';
        const hours = Math.round(diffMins / 60);
        if (hours < 0) return `${Math.abs(hours)} hour${Math.abs(hours) !== 1 ? 's' : ''} before session`;
        return `${hours} hour${hours !== 1 ? 's' : ''} after session`;
    }

    getWindDirection(degrees) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(degrees / 45) % 8;
        return {
            text: directions[index],
            // Arrow points UP by default. Wind direction is "coming from".
            // 0 deg (N) -> Blows South -> Rotate 180 to point Down.
            rotation: degrees + 180
        };
    }
}
