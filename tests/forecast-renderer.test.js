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
        const units = { temperature_2m: '°C', wind_speed_10m: 'km/h', wind_direction_10m: '°' };
        const hour = (h, precipProb) => ({ time: at(h), code: 0, temp: 20, windSpeed: 10, windDir: 0, precipProb });
        const time = (h) => new Intl.DateTimeFormat(i18n.locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(at(h) * 1000));

        it('sums up the session in one sentence', () => {
            const race = { id: 'race', name: 'Race' };
            expect(renderer.createRainVerdictElement([hour(0, 5), hour(1, 10)], start, race).textContent)
                .toBe('Rain unlikely during Race');

            const likely = renderer.createRainVerdictElement([hour(0, 30), hour(1, 70), hour(2, 90)], start, race);
            expect(likely.className).toBe('forecast-verdict forecast-verdict--likely');
            expect(likely.textContent).toBe(`Rain likely during Race: 70% around ${time(1)}`);

            // Non-race sessions only look at their first hour
            const quali = renderer.createRainVerdictElement([hour(0, 25), hour(1, 90)], start, { id: 'qualifying', name: 'Qualifying' });
            expect(quali.textContent).toBe(`Chance of rain during Qualifying: 25% around ${time(0)}`);
        });

        it('leads the dashboard when a session is given, and is skipped otherwise', () => {
            const hourly = [hour(0, 5)];
            const dashboard = renderer.createForecastDashboard({ hourly, units }, start, mockClient, { id: 'fp1', name: 'FP1' });
            expect(dashboard.appendChild.mock.calls[0][0].className).toBe('forecast-verdict forecast-verdict--dry');

            const without = renderer.createForecastDashboard({ hourly, units }, start, mockClient);
            expect(without.appendChild.mock.calls[0][0].className).not.toMatch(/verdict/);

            // No forecast hours in the session: no verdict
            const outside = renderer.createForecastDashboard({ hourly: [hour(5, 90)], units }, start, mockClient, { id: 'fp1', name: 'FP1' });
            expect(outside.appendChild.mock.calls[0][0].className).not.toMatch(/verdict/);
        });
    });
});
