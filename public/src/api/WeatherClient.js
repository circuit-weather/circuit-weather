import { CONFIG } from '../config.js';
import { i18n } from '../i18n/index.js';
import { windToVector } from '../utils/wind.js';

export class WeatherClient {
    constructor() {
        this.baseUrl = CONFIG.weatherApi;
        this.cache = new Map();
        this.windFieldCache = new Map();
        this.maxCacheSize = CONFIG.WEATHER_CACHE_MAX_ENTRIES;
        this.cacheTTL = CONFIG.SESSION_FORECAST_REFRESH_INTERVAL_MS;
    }

    /**
     * Fetch a gridded snapshot of current wind over an explicit bounding box,
     * in a single Open-Meteo request (it accepts comma-separated coordinate
     * lists). Returns u/v vector components for the wind overlay.
     *
     * Bounds are snapped to 0.5° increments for the cache key so minor pans
     * don't trigger a new API call.
     */
    async getWindField(minLat, maxLat, minLon, maxLon) {
        const snap = 0.5;
        const cacheKey = [minLat, maxLat, minLon, maxLon]
            .map(v => (Math.round(v / snap) * snap).toFixed(1))
            .join(',');

        const cached = this.windFieldCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            // Move to most recently used
            this.windFieldCache.delete(cacheKey);
            this.windFieldCache.set(cacheKey, cached);
            return cached.field;
        } else if (cached) {
            this.windFieldCache.delete(cacheKey);
        }

        const n = CONFIG.WIND_FIELD_GRID;

        const lats = [];
        const lons = [];
        for (let row = 0; row < n; row++) {
            const glat = minLat + (maxLat - minLat) * (row / (n - 1));
            for (let col = 0; col < n; col++) {
                const glon = minLon + (maxLon - minLon) * (col / (n - 1));
                lats.push(glat.toFixed(4));
                lons.push(glon.toFixed(4));
            }
        }

        const params = new URLSearchParams({
            latitude: lats.join(','),
            longitude: lons.join(','),
            current: 'wind_speed_10m,wind_direction_10m',
            timeformat: 'unixtime',
        });

        // A 5s request timeout is already in place here via AbortSignal.timeout;
        // Open-Meteo is called direct from the client, so there is no worker
        // TIMEOUT_API_* constant covering it. Not a missing-timeout gap.
        const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error('Wind field API error');

        const data = await response.json();
        const list = Array.isArray(data) ? data : [data];

        const u = new Array(n * n).fill(0);
        const v = new Array(n * n).fill(0);
        for (let i = 0; i < list.length && i < n * n; i++) {
            const current = list[i] && list[i].current;
            if (!current) continue;
            const vec = windToVector(current.wind_speed_10m, current.wind_direction_10m);
            u[i] = vec.u;
            v[i] = vec.v;
        }

        const field = { minLat, maxLat, minLon, maxLon, rows: n, cols: n, u, v };
        this.windFieldCache.set(cacheKey, { timestamp: Date.now(), field });
        if (this.windFieldCache.size > this.maxCacheSize) {
            this.windFieldCache.delete(this.windFieldCache.keys().next().value);
        }
        return field;
    }

    /**
     * @param {Date} sessionTime - Session start
     * @param {Date} [endTime] - When the session counts as finished (utils/sessionTiming.js);
     *   the hourly forecast covers the hours from now (or the start) up to it
     */
    async getForecast(lat, lon, sessionTime, endTime = null) {
        // A finished session has no forecast left to show
        if (endTime && endTime.getTime() <= Date.now()) {
            return { available: false, reason: 'ended' };
        }

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
            const cacheKey = `${rLat},${rLon},${sessionTime.getTime()}`;
            let data;

            if (this.cache.has(cacheKey)) {
                const entry = this.cache.get(cacheKey);
                if (Date.now() - entry.timestamp < this.cacheTTL) {
                    data = entry.data;
                    // Move to most recently used
                    this.cache.delete(cacheKey);
                    this.cache.set(cacheKey, entry);
                } else {
                    this.cache.delete(cacheKey);
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

                data = await this.fetchForecastData(url);
                this.cache.set(cacheKey, { timestamp: Date.now(), data });

                if (this.cache.size > this.maxCacheSize) {
                    this.cache.delete(this.cache.keys().next().value);
                }
            }

            const hourlyFiltered = this.filterHourly(data.hourly, sessionTime, endTime?.getTime(), Date.now());

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

    /**
     * Fetches the forecast, retrying once after a timeout or network failure.
     * Without the retry, one slow response on a mobile connection left the
     * session without a forecast (or rain banner) until the next 15-minute
     * refresh. HTTP errors are not retried: Open-Meteo's 429s and outages
     * would only get more requests.
     */
    async fetchForecastData(url) {
        let response;
        try {
            response = await fetch(url, { signal: AbortSignal.timeout(CONFIG.WEATHER_FETCH_TIMEOUT_MS) });
        } catch (error) {
            // fetch() only rejects for a timeout or a network failure
            console.warn('Weather fetch failed, retrying:', error?.name);
            await new Promise(resolve => setTimeout(resolve, CONFIG.WEATHER_RETRY_DELAY_MS));
            response = await fetch(url, { signal: AbortSignal.timeout(CONFIG.WEATHER_RETRY_TIMEOUT_MS) });
        }
        if (!response.ok) throw new Error('Weather API error');
        return response.json();
    }

    /**
     * The hours of a session still to come: from the hour the session starts in
     * (or, once it is under way, the hour in progress) to the session's end.
     * Each row describes the hour starting at its time.
     *
     * @param {Object} hourly - Open-Meteo hourly arrays
     * @param {Date} sessionTime
     * @param {number} [endMs] - Session end (default: 3 hours after the start)
     * @param {number} [nowMs] - Hours over by now are left out
     */
    filterHourly(hourly, sessionTime, endMs = sessionTime.getTime() + 3 * 3600000, nowMs = 0) {
        const fromMs = Math.max(sessionTime.getTime(), nowMs);
        const startTs = Math.floor(fromMs / 3600000) * 3600;
        // Rows start on the hour: the last one starts before the session ends
        const endTs = Math.ceil(endMs / 1000) - 1;

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
                    // Each row describes the hour starting at `time`. Open-Meteo stamps
                    // precipitation_probability with the end of the hour it covers
                    // ("preceding hour"), so that hour's chance is the next value.
                    // Temperature, wind and weather code are instantaneous at `time`.
                    precipProb: precips[i + 1] ?? null,
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
        if (code === 0) return i18n.t('weatherCodes.clearSky');
        if (code <= 3) return i18n.t('weatherCodes.partlyCloudy');
        if (code <= 48) return i18n.t('weatherCodes.fog');
        if (code <= 55) return i18n.t('weatherCodes.drizzle');
        if (code <= 67) return i18n.t('weatherCodes.rain');
        if (code <= 77) return i18n.t('weatherCodes.snowGrains');
        if (code <= 82) return i18n.t('weatherCodes.rainShowers');
        if (code <= 86) return i18n.t('weatherCodes.snowShowers');
        if (code <= 99) return i18n.t('weatherCodes.thunderstorm');
        return i18n.t('weatherCodes.unknown');
    }

    getAccessibleRelativeTime(timestamp, sessionTime) {
        const diffMins = (timestamp * 1000 - sessionTime.getTime()) / CONFIG.ONE_MINUTE_MS;

        if (Math.abs(diffMins) < 30) return i18n.t('radar.sessionStart');
        const hours = Math.round(diffMins / 60);
        if (hours < 0) {
            const value = Math.abs(hours);
            const unit = value === 1 ? i18n.t('countdown.hour') : i18n.t('countdown.hourPlural');
            return i18n.t('radar.beforeSession', { duration: `${value} ${unit}` });
        }
        const unit = hours === 1 ? i18n.t('countdown.hour') : i18n.t('countdown.hourPlural');
        return i18n.t('radar.afterSession', { duration: `${hours} ${unit}` });
    }
}
