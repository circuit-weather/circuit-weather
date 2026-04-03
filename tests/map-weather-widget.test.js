import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Leaflet (L)
const mapMock = {
    // Add any map methods if needed
};

// Mock DOM Element
const createMockElement = (tag, className) => {
    const el = {
        tagName: tag.toUpperCase(),
        className: className || '',
        innerHTML: '',
        textContent: '',
        children: [],
        querySelector: vi.fn((selector) => {
            // Simple mock: return a dummy element that can hold textContent
            return {
                textContent: '',
                style: {},
                classList: {
                    add: vi.fn(),
                    remove: vi.fn(),
                    toggle: vi.fn()
                }
            };
        }),
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
        classList: {
            add: vi.fn(),
            remove: vi.fn()
        }
    };
    return el;
};

// Mock Document
vi.stubGlobal('document', {
    createElement: vi.fn((tag) => createMockElement(tag, '')),
});

// Setup global mocks
vi.stubGlobal('L', {
    Control: {
        extend: (proto) => {
            // Return a class that mimics L.Control behavior + the prototype methods
            return class MockControl {
                constructor(options) {
                    this.options = options || {};
                    // Copy prototype methods to instance
                    Object.assign(this, proto);
                }
                addTo(map) {
                    this.onAdd(map);
                    return this;
                }
                remove() {
                    this.onRemove(this.map);
                }
            };
        }
    },
    DomUtil: {
        create: vi.fn((tag, className) => createMockElement(tag, className))
    }
});

// Import the module under test
const { MapWeatherWidget } = await import('../public/src/map/MapWeatherWidget.js');

describe('MapWeatherWidget', () => {
    let widget;

    beforeEach(() => {
        vi.clearAllMocks();
        widget = new MapWeatherWidget();
        // Manually trigger onAdd as if added to map
        widget.onAdd(mapMock);
    });

    it('should initialize with correct DOM structure', () => {
        expect(document.createElement).toHaveBeenCalledWith('div');
        expect(widget._div).toBeDefined();
        expect(widget._div.setAttribute).toHaveBeenCalledWith('data-i18n-attr', 'aria-label:weather.currentCircuitWeather');

        // Check if innerHTML was set and contains i18n bindings
        expect(widget._div.innerHTML).toContain('weather-widget-metric');
        expect(widget._div.innerHTML).toContain('data-i18n="weather.currentConditions"');
        expect(widget._div.innerHTML).toContain('data-i18n-attr="aria-label:weather.temperature,title:weather.temperature"');

        // Verify UI cache was created
        expect(widget._ui).toBeDefined();
        expect(widget._ui.temp).toBeDefined();
        expect(widget._ui.rain).toBeDefined();
        expect(widget._ui.humid).toBeDefined();
        expect(widget._ui.wind).toBeDefined();
    });

    it('should update with valid weather data', () => {
        const weatherData = {
            current: {
                temperature_2m: 25.4,
                precipitation_probability: 10,
                relative_humidity_2m: 65,
                wind_speed_10m: 15.2
            },
            units: {
                temperature_2m: '°C',
                wind_speed_10m: 'km/h'
            }
        };

        widget.update(weatherData);

        expect(widget._ui.temp.textContent).toBe('25°C');
        expect(widget._ui.rain.textContent).toBe('10%');
        expect(widget._ui.humid.textContent).toBe('65%');
        expect(widget._ui.wind.textContent).toBe('15 km/h');
    });

    it('should handle missing/null weather data gracefully', () => {
        // Set some initial values
        widget._ui.temp.textContent = '25°C';

        // Update with null
        widget.update(null);

        expect(widget._ui.temp.textContent).toBe('--');
        expect(widget._ui.rain.textContent).toBe('--%');
        expect(widget._ui.humid.textContent).toBe('--%');
        expect(widget._ui.wind.textContent).toBe('--');
    });

    it('should handle missing current weather object', () => {
        widget.update({});

        expect(widget._ui.temp.textContent).toBe('--');
        expect(widget._ui.rain.textContent).toBe('--%');
    });

    it('should default missing metric values to 0', () => {
        const partialData = {
            current: {
                temperature_2m: 20,
                wind_speed_10m: 10
                // Missing precipitation and humidity
            },
            units: {
                temperature_2m: '°C',
                wind_speed_10m: 'km/h'
            }
        };

        widget.update(partialData);

        // Code uses || 0 for precipitation and humidity
        expect(widget._ui.rain.textContent).toBe('0%');
        expect(widget._ui.humid.textContent).toBe('0%');
        expect(widget._ui.temp.textContent).toBe('20°C');
    });

    it('should clean up references on remove', () => {
        // Mock a parent node
        widget._div.parentNode = {
            removeChild: vi.fn()
        };
        widget.onRemove(mapMock);
        expect(widget._div.parentNode.removeChild).toHaveBeenCalledWith(widget._div);
    });

    it('should not throw if update called before onAdd (no UI)', () => {
        const uninitializedWidget = new MapWeatherWidget();
        // Should return early and not throw
        expect(() => uninitializedWidget.update(null)).not.toThrow();
    });

    it('should not throw if update called after onRemove', () => {
        widget.onRemove(mapMock);
        // Should return early
        expect(() => widget.update({})).not.toThrow();
    });
});
