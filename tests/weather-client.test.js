import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before importing WeatherClient
vi.mock('../public/src/config.js', () => ({
    CONFIG: {
        weatherApi: 'https://api.open-meteo.com/v1/forecast'
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

        it('returns "Start" for the session start hour', () => {
            expect(client.getRelativeTime(sessionHourTs, sessionTime)).toBe('Start');
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
});
