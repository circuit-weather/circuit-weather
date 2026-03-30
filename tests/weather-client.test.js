import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config before importing WeatherClient
vi.mock('../public/src/config.js', () => ({
    CONFIG: {
        weatherApi: 'https://api.open-meteo.com/v1/forecast',
        SESSION_FORECAST_REFRESH_INTERVAL_MS: 900000,
        ONE_MINUTE_MS: 60000,
        TILE_LOAD_TIMEOUT_MS: 3000,
        MIN_POLL_DELAY_MS: 30000,
        WEATHER_CACHE_MAX_ENTRIES: 50
    }
}));

import { WeatherClient } from '../public/src/api/WeatherClient.js';

describe('WeatherClient', () => {
    let client;

    beforeEach(() => {
        client = new WeatherClient();
    });

    describe('filterHourly', () => {
        // Session at Unix 10800 (3 hours from epoch)
        // Window: -1.5h (5400s before) to +3h after
        // startTs = 10800 - 5400 = 5400
        // endTs = 10800 + 10800 = 21600
        const sessionTime = new Date(10800 * 1000);

        const makeHourly = (startTs, count) => {
            const times = [];
            const temps = [];
            const humids = [];
            const precips = [];
            const winds = [];
            const windDirs = [];
            const codes = [];

            for (let i = 0; i < count; i++) {
                times.push(startTs + i * 3600);
                temps.push(20 + i);
                humids.push(50 + i);
                precips.push(i * 10);
                winds.push(5 + i);
                windDirs.push(i * 45);
                codes.push(i);
            }

            return {
                time: times,
                temperature_2m: temps,
                relative_humidity_2m: humids,
                precipitation_probability: precips,
                wind_speed_10m: winds,
                wind_direction_10m: windDirs,
                weather_code: codes,
            };
        };

        it('filters data to the session window (-1.5h to +3h)', () => {
            // Data from hour 0 to hour 8 (9 entries, starting at ts=0)
            const hourly = makeHourly(0, 9);
            const result = client.filterHourly(hourly, sessionTime);

            // Window: 5400 to 21600
            // Valid times: 7200 (2h), 10800 (3h), 14400 (4h), 18000 (5h), 21600 (6h)
            // ts=3600 is 3600 < 5400, excluded
            // ts=25200 is > 21600, excluded
            expect(result.length).toBe(5);
            expect(result[0].time).toBe(7200);
            expect(result[result.length - 1].time).toBe(21600);
        });

        it('returns empty array when times array is empty', () => {
            const hourly = { time: [], temperature_2m: [] };
            const result = client.filterHourly(hourly, sessionTime);
            expect(result).toEqual([]);
        });

        it('returns empty array when times is undefined', () => {
            const hourly = {};
            const result = client.filterHourly(hourly, sessionTime);
            expect(result).toEqual([]);
        });

        it('maps fields correctly in output objects', () => {
            // Single data point inside the window
            const hourly = makeHourly(10800, 1);
            const result = client.filterHourly(hourly, sessionTime);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                time: 10800,
                temp: 20,
                humidity: 50,
                precipProb: 0,
                windSpeed: 5,
                windDir: 0,
                code: 0,
            });
        });

        it('handles missing humidity gracefully', () => {
            const hourly = {
                time: [10800],
                temperature_2m: [25],
                relative_humidity_2m: null,
                precipitation_probability: [10],
                wind_speed_10m: [5],
                wind_direction_10m: [90],
                weather_code: [0],
            };
            const result = client.filterHourly(hourly, sessionTime);
            expect(result[0].humidity).toBeNull();
        });
    });

    describe('getWeatherDescription', () => {
        const cases = [
            [0, 'Clear sky'],
            [1, 'Partly cloudy'],
            [3, 'Partly cloudy'],
            [4, 'Fog'],
            [48, 'Fog'],
            [49, 'Drizzle'],
            [55, 'Drizzle'],
            [56, 'Rain'],
            [67, 'Rain'],
            [68, 'Snow grains'],
            [77, 'Snow grains'],
            [78, 'Rain showers'],
            [82, 'Rain showers'],
            [83, 'Snow showers'],
            [86, 'Snow showers'],
            [87, 'Thunderstorm'],
            [99, 'Thunderstorm'],
            [100, 'Unknown'],
        ];

        cases.forEach(([code, expected]) => {
            it(`returns '${expected}' for WMO code ${code}`, () => {
                expect(client.getWeatherDescription(code)).toBe(expected);
            });
        });
    });

    describe('getRelativeTime', () => {
        // Session at 2023-03-05 14:30:00 UTC
        const sessionTime = new Date('2023-03-05T14:30:00Z');
        // Session hour anchor: 14:00:00 UTC = 1678024800
        const sessionHourTs = Math.floor(new Date('2023-03-05T14:00:00Z').getTime() / 1000);

        it('returns "Session start" for the session start hour', () => {
            expect(client.getRelativeTime(sessionHourTs, sessionTime)).toBe('Session start');
        });

        it('returns negative label for hours before session', () => {
            expect(client.getRelativeTime(sessionHourTs - 3600, sessionTime)).toBe('-1h');
        });

        it('returns positive label for hours after session', () => {
            expect(client.getRelativeTime(sessionHourTs + 7200, sessionTime)).toBe('+2h');
        });

        it('returns "+3h" for 3 hours after', () => {
            expect(client.getRelativeTime(sessionHourTs + 10800, sessionTime)).toBe('+3h');
        });
    });

    describe('getAccessibleRelativeTime', () => {
        const sessionTime = new Date('2023-03-05T14:00:00Z');
        const sessionTs = sessionTime.getTime() / 1000;

        it('returns "Session start" within 30 minutes of session', () => {
            expect(client.getAccessibleRelativeTime(sessionTs, sessionTime)).toBe('Session start');
            // 29 minutes before
            expect(client.getAccessibleRelativeTime(sessionTs - 29 * 60, sessionTime)).toBe('Session start');
        });

        it('returns singular "hour" for exactly 1 hour before', () => {
            expect(client.getAccessibleRelativeTime(sessionTs - 3600, sessionTime)).toBe('1 hour before session');
        });

        it('returns plural "hours" for multiple hours before', () => {
            expect(client.getAccessibleRelativeTime(sessionTs - 7200, sessionTime)).toBe('2 hours before session');
        });

        it('returns singular "hour" for exactly 1 hour after', () => {
            expect(client.getAccessibleRelativeTime(sessionTs + 3600, sessionTime)).toBe('1 hour after session');
        });

        it('returns plural "hours" for multiple hours after', () => {
            expect(client.getAccessibleRelativeTime(sessionTs + 10800, sessionTime)).toBe('3 hours after session');
        });
    });

    describe('getWindDirection', () => {
        const cases = [
            [0, 'N', 180],
            [45, 'NE', 225],
            [90, 'E', 270],
            [135, 'SE', 315],
            [180, 'S', 360],
            [225, 'SW', 405],
            [270, 'W', 450],
            [315, 'NW', 495],
            [360, 'N', 540],
        ];

        cases.forEach(([degrees, text, rotation]) => {
            it(`returns ${text} (rotation ${rotation}°) for ${degrees}°`, () => {
                const result = client.getWindDirection(degrees);
                expect(result.text).toBe(text);
                expect(result.rotation).toBe(rotation);
            });
        });
    });

    describe('getForecast', () => {
        let mockFetch;

        beforeEach(() => {
            mockFetch = vi.fn();
            vi.stubGlobal('fetch', mockFetch);
            vi.useFakeTimers();
            vi.setSystemTime(1700000000000); // Fixed "now"
        });

        afterEach(() => {
            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        const makeMockResponse = (hourly, current = {}) => ({
            ok: true,
            json: () => Promise.resolve({
                hourly,
                current,
                current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
            }),
        });

        it('returns too_far when session is more than 16 days away', async () => {
            const futureSession = new Date(Date.now() + 17 * 24 * 60 * 60 * 1000);
            const result = await client.getForecast(0, 0, futureSession);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('too_far');
            expect(result.availableFrom).toBeInstanceOf(Date);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('fetches forecast and returns available data', async () => {
            // Session 1 day from now (well within range)
            const sessionTime = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
            const sessionTs = Math.floor(sessionTime.getTime() / 1000);

            const hourly = {
                time: [sessionTs],
                temperature_2m: [22],
                relative_humidity_2m: [55],
                precipitation_probability: [10],
                wind_speed_10m: [8],
                wind_direction_10m: [180],
                weather_code: [1],
            };

            mockFetch.mockResolvedValueOnce(makeMockResponse(hourly, { temperature_2m: 21 }));

            const result = await client.getForecast(50.123456, 14.987654, sessionTime);

            expect(result.available).toBe(true);
            expect(result.hourly).toHaveLength(1);
            expect(result.current).toEqual({ temperature_2m: 21 });
            expect(mockFetch).toHaveBeenCalledOnce();
        });

        it('rounds coordinates to 2 decimal places in fetch URL', async () => {
            const sessionTime = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
            const sessionTs = Math.floor(sessionTime.getTime() / 1000);

            const hourly = {
                time: [sessionTs],
                temperature_2m: [22],
                relative_humidity_2m: [55],
                precipitation_probability: [10],
                wind_speed_10m: [8],
                wind_direction_10m: [180],
                weather_code: [1],
            };

            mockFetch.mockResolvedValueOnce(makeMockResponse(hourly));

            await client.getForecast(50.123456, 14.987654, sessionTime);

            const calledUrl = mockFetch.mock.calls[0][0];
            expect(calledUrl).toContain('latitude=50.12');
            expect(calledUrl).toContain('longitude=14.99');
        });

        it('uses cache on second call with same coordinates', async () => {
            const sessionTime = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
            const sessionTs = Math.floor(sessionTime.getTime() / 1000);

            const hourly = {
                time: [sessionTs],
                temperature_2m: [22],
                relative_humidity_2m: [55],
                precipitation_probability: [10],
                wind_speed_10m: [8],
                wind_direction_10m: [180],
                weather_code: [1],
            };

            mockFetch.mockResolvedValueOnce(makeMockResponse(hourly));

            // First call — fetches
            await client.getForecast(50.12, 14.99, sessionTime);
            expect(mockFetch).toHaveBeenCalledOnce();

            // Second call — should use cache, no new fetch
            const result = await client.getForecast(50.12, 14.99, sessionTime);
            expect(mockFetch).toHaveBeenCalledOnce(); // Still only 1 call
            expect(result.available).toBe(true);
        });

        it('returns error result when fetch fails', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const sessionTime = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await client.getForecast(0, 0, sessionTime);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('error');
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });

        it('returns error result when response is not ok', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const sessionTime = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
            mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

            const result = await client.getForecast(0, 0, sessionTime);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('error');
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });

        it('returns too_far when hourly data is empty after filtering', async () => {
            const sessionTime = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);

            // Return data that won't match the session window
            const hourly = {
                time: [0], // Way in the past, won't match
                temperature_2m: [22],
                relative_humidity_2m: [55],
                precipitation_probability: [10],
                wind_speed_10m: [8],
                wind_direction_10m: [180],
                weather_code: [1],
            };

            mockFetch.mockResolvedValueOnce(makeMockResponse(hourly));

            const result = await client.getForecast(0, 0, sessionTime);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('too_far');
        });
    });
});
