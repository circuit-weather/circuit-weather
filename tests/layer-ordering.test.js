import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RangeCircles } from '../public/src/map/RangeCircles.js';
import { WeatherRadar } from '../public/src/map/WeatherRadar.js';

// Mock Leaflet
const mockCircle = {
    addTo: vi.fn(),
    setLatLng: vi.fn(),
    setRadius: vi.fn(),
    setStyle: vi.fn(),
    bringToFront: vi.fn(),
};

const mockMarker = {
    addTo: vi.fn(),
    setLatLng: vi.fn(),
    setIcon: vi.fn(),
    setZIndexOffset: vi.fn(),
};

const mockMapLeaflet = {
    on: vi.fn(),
    getBounds: vi.fn(() => ({
        getNorth: vi.fn(() => 51.52),
        getSouth: vi.fn(() => 51.48),
        getEast: vi.fn(() => -0.08),
        getWest: vi.fn(() => -0.12),
    })),
    distance: vi.fn(() => 5000),
    hasLayer: vi.fn(() => false),
    removeLayer: vi.fn(),
};

vi.stubGlobal('L', {
    circle: vi.fn(() => mockCircle),
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => mockMarker),
    latLng: vi.fn((lat, lng) => ({ lat, lng })),
});

// Mock Mapbox
const mockMapbox = {
    on: vi.fn(),
    hasLayer: undefined,
    getBounds: vi.fn(() => ({
        getNorth: vi.fn(() => 51.52),
        getSouth: vi.fn(() => 51.48),
        getEast: vi.fn(() => -0.08),
        getWest: vi.fn(() => -0.12),
    })),
    getSource: vi.fn(),
    addSource: vi.fn(),
    getLayer: vi.fn(),
    addLayer: vi.fn(),
    moveLayer: vi.fn(),
    once: vi.fn(),
};

// Mock DOM
vi.stubGlobal('document', {
    getElementById: vi.fn(),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    documentElement: {
        getAttribute: vi.fn(() => 'dark'),
        style: {
            getPropertyValue: vi.fn(() => ''),
        }
    },
});

vi.stubGlobal('getComputedStyle', vi.fn(() => ({
    getPropertyValue: vi.fn(() => '#ff0000'),
})));

describe('Layer Ordering Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('RangeCircles.drawLeaflet calls bringToFront and setZIndexOffset', () => {
        const rc = new RangeCircles(mockMapLeaflet);
        rc.draw([51.5, -0.1]);

        expect(mockCircle.bringToFront).toHaveBeenCalled();
        expect(mockMarker.setZIndexOffset).toHaveBeenCalledWith(1000);
    });

    it('RangeCircles.drawMapbox calls moveLayer', () => {
        mockMapbox.getLayer.mockReturnValue(true);
        const rc = new RangeCircles(mockMapbox);
        rc.draw([51.5, -0.1]);

        expect(mockMapbox.moveLayer).toHaveBeenCalledWith('range-circles-line');
        expect(mockMapbox.moveLayer).toHaveBeenCalledWith('range-labels');
    });

    it('WeatherRadar.createMapboxLayer uses range-circles-line as beforeId', () => {
        mockMapbox.getLayer.mockImplementation((id) => id === 'range-circles-line');

        const wr = new WeatherRadar(mockMapbox);
        const frame = { time: 123, path: '/test', url: 'test.png' };
        const layerProxy = wr.createMapboxLayer(frame, 0);

        layerProxy.addTo(mockMapbox);

        expect(mockMapbox.addLayer).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'radar-layer-0' }),
            'range-circles-line'
        );
    });
});
