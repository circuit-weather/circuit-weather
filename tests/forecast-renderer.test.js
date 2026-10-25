import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForecastRenderer } from '../public/src/ui/ForecastRenderer.js';
import { CircuitWeatherApp } from '../public/src/CircuitWeatherApp.js';

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
});
