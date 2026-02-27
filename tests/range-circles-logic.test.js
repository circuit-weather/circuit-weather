import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Leaflet
const mockCircle = {
    addTo: vi.fn(),
    setLatLng: vi.fn(),
    setRadius: vi.fn(),
    setStyle: vi.fn(),
};

const mockMarker = {
    addTo: vi.fn(),
    setLatLng: vi.fn(),
    setIcon: vi.fn(),
    remove: vi.fn(),
};

const mockMap = {
    on: vi.fn(),
    getBounds: vi.fn(() => ({
        getNorth: vi.fn(() => 51.52), // Just north of center
    })),
    distance: vi.fn((p1, p2) => 5000), // Default 5km visible radius
    hasLayer: vi.fn(() => false),
    removeLayer: vi.fn(),
    addLayer: vi.fn(),
};

vi.stubGlobal('L', {
    circle: vi.fn(() => ({ ...mockCircle })),
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({ ...mockMarker })),
    circleMarker: vi.fn(() => ({
        addTo: vi.fn(),
        setLatLng: vi.fn(),
        setStyle: vi.fn(),
        bringToFront: vi.fn()
    })),
    latLng: vi.fn((lat, lng) => ({ lat, lng })),
});

// Mock DOM
vi.stubGlobal('document', {
    getElementById: vi.fn(() => ({
        addEventListener: vi.fn(),
    })),
    querySelectorAll: vi.fn(() => []),
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

vi.stubGlobal('navigator', {
    language: 'en-US',
});


// Mock SafeStorage
vi.mock('../public/src/utils/storage.js', () => ({
    SafeStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
    }
}));

import { RangeCircles } from '../public/src/map/RangeCircles.js';
import { SafeStorage } from '../public/src/utils/storage.js';

describe('RangeCircles Logic', () => {
    let rangeCircles;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset SafeStorage mock
        SafeStorage.getItem.mockReturnValue(null);
        // Reset navigator language
        Object.defineProperty(navigator, 'language', {
            value: 'en-US',
            configurable: true
        });
    });

    describe('Initialization & Unit Detection', () => {
        it('uses stored unit if available', () => {
            SafeStorage.getItem.mockReturnValue('metric');
            rangeCircles = new RangeCircles(mockMap);
            expect(rangeCircles.unit).toBe('metric');
        });

        it('defaults to imperial for US locale when storage is empty', () => {
            Object.defineProperty(navigator, 'language', { value: 'en-US' });
            rangeCircles = new RangeCircles(mockMap);
            expect(rangeCircles.unit).toBe('imperial');
        });

        it('defaults to metric for non-imperial locales (e.g. GB)', () => {
            Object.defineProperty(navigator, 'language', { value: 'en-GB' });
            rangeCircles = new RangeCircles(mockMap);
            expect(rangeCircles.unit).toBe('metric');
        });

        it('binds events correctly', () => {
            const addEventListener = vi.fn();
            document.getElementById.mockReturnValue({ addEventListener });
            rangeCircles = new RangeCircles(mockMap);
            expect(addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
            expect(mockMap.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
        });
    });

    describe('Drawing & Pooling', () => {
        beforeEach(() => {
            rangeCircles = new RangeCircles(mockMap);
            // Setup map distance to control visible radius
            // 5000m visible radius -> target step ~1250m -> normalized ~1.25 -> niceStep 1000m
            mockMap.distance.mockReturnValue(5000);
            rangeCircles.unit = 'metric';
        });

        it('creates new circles on first draw', () => {
            const center = [51.5, -0.1];
            rangeCircles.draw(center);

            // Should create circles
            expect(L.circle).toHaveBeenCalled();
            // The mock implementation returns an object spread from mockCircle,
            // so the methods share the same vi.fn() instances.
            expect(mockCircle.addTo).toHaveBeenCalledWith(mockMap);
            expect(rangeCircles.circles.length).toBeGreaterThan(0);
        });

        it('reuses existing circles on subsequent draw (pooling)', () => {
            const center1 = [51.5, -0.1];
            rangeCircles.draw(center1);

            const initialCallCount = L.circle.mock.calls.length;
            const initialAddCount = mockCircle.addTo.mock.calls.length;

            // Update with slightly different center to force redraw but keep step count same
            const center2 = [51.51, -0.11];
            rangeCircles.draw(center2);

            // Should NOT create new circles (pooling)
            expect(L.circle.mock.calls.length).toBe(initialCallCount);

            // Should update existing circles
            expect(mockCircle.setLatLng).toHaveBeenCalledWith(center2);
        });

        it('removes extra circles when steps decrease', () => {
            // First draw: large visible radius -> many steps
            mockMap.distance.mockReturnValue(50000);
            rangeCircles.draw([51.5, -0.1]);
            const countHigh = rangeCircles.circles.length;

            // Second draw: small visible radius -> fewer steps
            mockMap.distance.mockReturnValue(1000);
            rangeCircles.draw([51.5, -0.1]);
            const countLow = rangeCircles.circles.length;

            expect(countLow).toBeLessThan(countHigh);
            expect(mockMap.removeLayer).toHaveBeenCalled();
        });

        it('updates unit and redraws', () => {
            const center = [51.5, -0.1];
            rangeCircles.draw(center);

            rangeCircles.setUnit('imperial');

            expect(SafeStorage.setItem).toHaveBeenCalledWith('unit', 'imperial');
            expect(rangeCircles.unit).toBe('imperial');
            // Should trigger redraw (mockCircle.setRadius called with different values)
            // hard to verify exact values without complex setup, but we can verify it ran.
        });
    });

    describe('Theme Updates', () => {
        it('resolves color from computed style', () => {
            rangeCircles = new RangeCircles(mockMap);
            // Default mock returns #ff0000
            expect(rangeCircles.rangeColor).toBe('#ff0000');
        });

        it('updates color on theme change', () => {
            rangeCircles = new RangeCircles(mockMap);

            // Change mock return
            vi.mocked(getComputedStyle).mockReturnValue({
                getPropertyValue: vi.fn(() => '#00ff00')
            });

            rangeCircles.updateTheme();
            expect(rangeCircles.rangeColor).toBe('#00ff00');
        });

        it('falls back to dark theme color if CSS var missing', () => {
             vi.mocked(getComputedStyle).mockReturnValue({
                getPropertyValue: vi.fn(() => '') // Empty
            });
            document.documentElement.getAttribute.mockReturnValue('dark');

            rangeCircles = new RangeCircles(mockMap);
            expect(rangeCircles.rangeColor).toBe('#ff6b5b');
        });

        it('falls back to light theme color if CSS var missing', () => {
             vi.mocked(getComputedStyle).mockReturnValue({
                getPropertyValue: vi.fn(() => '') // Empty
            });
            document.documentElement.getAttribute.mockReturnValue('light');

            rangeCircles = new RangeCircles(mockMap);
            expect(rangeCircles.rangeColor).toBe('#e10600');
        });
    });

    describe('Visibility & Clearing', () => {
        beforeEach(() => {
            rangeCircles = new RangeCircles(mockMap);
        });

        it('clears all layers including center marker', () => {
            // Setup layers
            const mockLabel = { addTo: vi.fn(), remove: vi.fn() };
            rangeCircles.circles = [mockCircle];
            rangeCircles.labels = [mockLabel];
            rangeCircles.centerMarker = mockMarker;

            rangeCircles.clear();

            expect(mockMap.removeLayer).toHaveBeenCalledWith(mockCircle);
            expect(mockMap.removeLayer).toHaveBeenCalledWith(mockLabel);
            expect(mockMap.removeLayer).toHaveBeenCalledWith(mockMarker);
            expect(rangeCircles.circles).toHaveLength(0);
            expect(rangeCircles.labels).toHaveLength(0);
            expect(rangeCircles.centerMarker).toBeNull();
        });

        it('updates visibility by redrawing if center is set', () => {
            const spy = vi.spyOn(rangeCircles, 'draw').mockImplementation(() => {});

            // No center -> no draw
            rangeCircles.center = null;
            rangeCircles.updateVisibility();
            expect(spy).not.toHaveBeenCalled();

            // Center set -> draw called
            rangeCircles.center = [0, 0];
            rangeCircles.updateVisibility();
            expect(spy).toHaveBeenCalledWith([0, 0]);
        });
    });
});
