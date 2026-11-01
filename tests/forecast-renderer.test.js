import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForecastRenderer } from '../public/src/ui/ForecastRenderer.js';
import { CircuitWeatherApp } from '../public/src/CircuitWeatherApp.js';
import { i18n } from '../public/src/i18n/index.js';

describe('ForecastRenderer Unit Tests', () => {
    let renderer;
    let app;
    let mockClient;

    beforeEach(() => {
        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            matchMedia: vi.fn(() => ({ addEventListener: vi.fn(), matches: false })),
            location: { reload: vi.fn(), href: 'http://localhost' }
        });

        const createMockEl = () => ({
            setAttribute: vi.fn(),
            appendChild: vi.fn(),
            addEventListener: vi.fn(),
            style: {},
            classList: { toggle: vi.fn() },
            querySelector: vi.fn(() => ({ textContent: '' }))
        });

        vi.stubGlobal('document', {
            createElement: vi.fn(() => createMockEl()),
            createElementNS: vi.fn(() => createMockEl()),
            createTextNode: vi.fn((txt) => ({ textContent: txt })),
            querySelector: vi.fn(() => ({
                textContent: '',
                appendChild: vi.fn()
            })),
            getElementById: vi.fn()
        });

        mockClient = {
            getRelativeTime: vi.fn(() => '10m ago'),
            getWeatherDescription: vi.fn(() => 'Sunny'),
            getAccessibleRelativeTime: vi.fn(() => '10 minutes ago')
        };

        renderer = new ForecastRenderer();
        app = new CircuitWeatherApp();
        app.weatherClient = mockClient;
    });

    it('creates SVGs and metrics correctly', () => {
        expect(renderer.createErrorIconSvg()).toBeDefined();
        expect(renderer.createLoadingSpinnerSvg()).toBeDefined();
        expect(renderer.createWindArrowSvg(180)).toBeDefined();

        expect(app._createErrorIconSvg()).toBeDefined();
        expect(app._createLoadingSpinnerSvg()).toBeDefined();
        expect(app._createWindArrowSvg(180)).toBeDefined();
    });

    it('renders error state', () => {
        renderer.renderError('Failed');
        expect(app.renderError('Failed')).toBeUndefined();
    });

    it('creates metric and wind metric elements', () => {
        expect(renderer.createMetricElement('key', 'id', 'val')).toBeDefined();
        expect(renderer.createWindMetricElement(15, 180, 'km/h', '°')).toBeDefined();

        expect(app._createMetricElement('key', 'id', 'val')).toBeDefined();
        expect(app._createWindMetricElement(15, 180, 'km/h', '°')).toBeDefined();
    });

    it('creates current weather and timeline elements', () => {
        const sessionWeather = { temp: 25, windSpeed: 10, windDir: 180 };
        const units = { temperature_2m: '°C', wind_speed_10m: 'km/h', wind_direction_10m: '°' };
        const hourly = [{ time: 1000, code: 0, temp: 25, windSpeed: 10, precipProb: 10 }];

        expect(renderer.createCurrentWeatherElement(sessionWeather, units, hourly)).toBeDefined();
        expect(renderer.createTimelineItemElement(hourly[0], new Date(), units, mockClient)).toBeDefined();
        expect(renderer.createTimelineElement(hourly, new Date(), units, mockClient)).toBeDefined();
        expect(renderer.createForecastDashboard({ hourly, units }, new Date(), mockClient)).toBeDefined();

        expect(app._createCurrentWeatherElement(sessionWeather, units, hourly)).toBeDefined();
        expect(app._createTimelineItemElement(hourly[0], new Date(), units)).toBeDefined();
        expect(app._createTimelineElement(hourly, new Date(), units)).toBeDefined();
        expect(app._createForecastDashboard({ hourly, units }, new Date())).toBeDefined();
    });

    describe('rain verdict', () => {
        const start = new Date('2026-11-01T14:00:00Z');
        const at = (h) => start.getTime() / 1000 + h * 3600;
        const hour = (h, precipProb) => ({ time: at(h), code: 0, temp: 20, windSpeed: 10, windDir: 0, precipProb });
        const time = (h) => new Intl.DateTimeFormat(i18n.locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(at(h) * 1000));

        it('sums up the session in one sentence', () => {
            const race = { id: 'race', name: 'Race' };
            const before = at(-24) * 1000;
            const raceEnd = at(2) * 1000;
            expect(renderer.getRainVerdict([hour(0, 5), hour(1, 10)], start, race, raceEnd, before))
                .toEqual({ level: 'dry', text: 'Rain unlikely during Race' });

            // Timed at the middle of the wettest hour
            expect(renderer.getRainVerdict([hour(0, 30), hour(1, 70), hour(2, 90)], start, race, raceEnd, before))
                .toEqual({ level: 'likely', text: `Rain likely during Race: 70% between ${time(1)} and ${time(2)}` });

            // A one-hour session only looks at its hour
            expect(renderer.getRainVerdict([hour(0, 25), hour(1, 90)], start, { id: 'qualifying', name: 'Qualifying' }, at(1) * 1000, before))
                .toEqual({ level: 'possible', text: `Chance of rain during Qualifying: 25% between ${time(0)} and ${time(1)}` });

            // No forecast hours in the session
            expect(renderer.getRainVerdict([hour(5, 90)], start, race, raceEnd, before)).toBeNull();

            // Under way, only the hours still to come count, and the hour in progress is given from now
            expect(renderer.getRainVerdict([hour(0, 70), hour(1, 30)], start, race, raceEnd, at(1.25) * 1000))
                .toEqual({ level: 'possible', text: `Chance of rain during Race: 30% between ${time(1.25)} and ${time(2)}` });
        });
    });

    describe('timeline labels', () => {
        const nine = Date.parse('2026-11-01T09:00:00Z') / 1000;
        const clock = (seconds) => new Intl.DateTimeFormat(i18n.locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(seconds * 1000));

        it('labels each hour by its clock time, and the hour in progress "Now"', () => {
            expect(renderer.timelineLabel(nine, Date.parse('2026-11-01T08:30:00Z'))).toBe(clock(nine));
            expect(renderer.timelineLabel(nine, Date.parse('2026-11-01T09:00:00Z'))).toBe('Now');
            expect(renderer.timelineLabel(nine, Date.parse('2026-11-01T09:59:59Z'))).toBe('Now');
            expect(renderer.timelineLabel(nine, Date.parse('2026-11-01T10:00:00Z'))).toBe(clock(nine));
        });

        it('passes the time through to every row', () => {
            const units = { temperature_2m: '°C', wind_speed_10m: 'km/h' };
            const hourly = [nine, nine + 3600].map(time => ({ time, code: 0, temp: 20, windSpeed: 5, windDir: 0, precipProb: 10 }));
            const spy = vi.spyOn(renderer, 'timelineLabel');
            renderer.createForecastDashboard({ hourly, units }, new Date(nine * 1000), mockClient, Date.parse('2026-11-01T09:20:00Z'));
            expect(spy.mock.results.map(r => r.value)).toEqual(['Now', clock(nine + 3600)]);
        });
    });
});
