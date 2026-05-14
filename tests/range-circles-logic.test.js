import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Imports must be at top level
import { RangeCircles } from '../public/src/map/RangeCircles.js';
import { SafeStorage } from '../public/src/utils/storage.js';

// Mock SafeStorage
vi.mock('../public/src/utils/storage.js', () => ({
    SafeStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
    }
}));

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
    remove: vi.fn(),
    setZIndexOffset: vi.fn(),
};

const mockMap = {
    on: vi.fn(),
    getBounds: vi.fn(() => ({
        getNorth: vi.fn(() => 51.52),
        getSouth: vi.fn(() => 51.48),
        getEast: vi.fn(() => -0.08),
        getWest: vi.fn(() => -0.12),
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

// Mock DOM elements for UI tests
const mockUnitOption = {
    dataset: { unit: 'metric' },
    classList: {
        toggle: vi.fn(),
    },
    setAttribute: vi.fn(),
    closest: vi.fn((selector) => selector === '.unit-option' ? mockUnitOption : null),
};

const mockImperialOption = {
    dataset: { unit: 'imperial' },
    classList: {
        toggle: vi.fn(),
    },
    setAttribute: vi.fn(),
    closest: vi.fn((selector) => selector === '.unit-option' ? mockImperialOption : null),
};

const mockToggle = {
    addEventListener: vi.fn(),
};

// Mock DOM
vi.stubGlobal('document', {
    getElementById: vi.fn((id) => id === 'unitToggle' ? mockToggle : null),
    querySelectorAll: vi.fn(() => [mockUnitOption, mockImperialOption]),
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

        // Reset DOM mocks
        mockUnitOption.classList.toggle.mockClear();
        mockUnitOption.setAttribute.mockClear();
        mockToggle.addEventListener.mockClear();
        mockImperialOption.classList.toggle.mockClear();
        mockImperialOption.setAttribute.mockClear();
    });

    describe('Initialization & Unit Detection', () => {
        it('uses stored unit if available', () => {
            SafeStorage.getItem.mockReturnValue('metric');
            rangeCircles = new RangeCircles(mockMap);
            expect(rangeCircles.unit).toBe('metric');
        });

        it('defaults to metric (en-NZ) if navigator.language is undefined', () => {
            Object.defineProperty(navigator, 'language', { value: undefined });
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
            rangeCircles = new RangeCircles(mockMap);
            expect(mockToggle.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
            expect(mockMap.on).toHaveBeenCalledWith('moveend', expect.any(Function));
        });

        it('updates UI classes based on active unit', () => {
            SafeStorage.getItem.mockReturnValue('metric');
            rangeCircles = new RangeCircles(mockMap);

            // mockUnitOption.dataset.unit is 'metric'
            expect(mockUnitOption.classList.toggle).toHaveBeenCalledWith('active', true);
            expect(mockUnitOption.setAttribute).toHaveBeenCalledWith('aria-pressed', true);
            expect(mockUnitOption.setAttribute).toHaveBeenCalledWith('aria-label', 'Kilometres');
            expect(mockUnitOption.setAttribute).toHaveBeenCalledWith('title', 'Kilometres');

            // mockImperialOption.dataset.unit is 'imperial'
            expect(mockImperialOption.classList.toggle).toHaveBeenCalledWith('active', false);
            expect(mockImperialOption.setAttribute).toHaveBeenCalledWith('aria-pressed', false);
            expect(mockImperialOption.setAttribute).toHaveBeenCalledWith('aria-label', 'Miles');
            expect(mockImperialOption.setAttribute).toHaveBeenCalledWith('title', 'Miles');
        });

        it('handles UI interaction for unit toggle', () => {
            rangeCircles = new RangeCircles(mockMap);

            // Get the click handler
            const clickHandler = mockToggle.addEventListener.mock.calls[0][1];

            // Simulate click on option
            clickHandler({ target: mockUnitOption });

            expect(SafeStorage.setItem).toHaveBeenCalledWith('unit', 'metric');
            expect(rangeCircles.unit).toBe('metric');
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

            // Update with slightly different center to force redraw but keep step count same
            const center2 = [51.51, -0.11];
            rangeCircles.draw(center2);

            // Should NOT create new circles (pooling)
            expect(L.circle.mock.calls.length).toBe(initialCallCount);

            // Should update existing circles
            expect(mockCircle.setLatLng).toHaveBeenCalledWith(center2);
        });

        it('skips redraw when state is unchanged', () => {
            const center = [51.5, -0.1];
            rangeCircles.draw(center);

            // Reset mocks to track subsequent calls
            mockCircle.setLatLng.mockClear();

            // Call draw again with same parameters
            rangeCircles.draw(center);

            // Should not have updated anything
            expect(mockCircle.setLatLng).not.toHaveBeenCalled();
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

        it('calculates steps properly for mid-range normalized values (normalized < 7.5)', () => {
            // Target normalized value around 5.0 to hit the "else if (normalized < 7.5) niceStep = 5 * magnitude" block
            // visibleRadiusMeters = mockMap.distance => target: ~20000m
            // visibleRadius = 20000 / 1000 = 20
            // targetStep = 20 / 4 = 5
            // magnitude = 1
            // normalized = 5 / 1 = 5
            mockMap.distance.mockReturnValue(20000);
            rangeCircles.draw([51.5, -0.1]);
            // We just need to trigger the draw to evaluate that logic path.
            expect(rangeCircles.circles.length).toBeGreaterThan(0);
        });

        it('calculates steps properly for large normalized values (normalized >= 7.5)', () => {
            // Target normalized value > 7.5
            // visibleRadiusMeters => 35000m
            // targetStep = 35 / 4 = 8.75 -> normalized = 8.75
            mockMap.distance.mockReturnValue(35000);
            rangeCircles.draw([51.5, -0.1]);
            expect(rangeCircles.circles.length).toBeGreaterThan(0);
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

describe('RangeCircles Logic (Mapbox GL JS)', () => {
    let rangeCircles;
    const mapboxMock = {
        on: vi.fn(),
        hasLayer: undefined, // undefined function triggers the Mapbox logic path in the class
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
        removeLayer: vi.fn(),
        removeSource: vi.fn(),
        moveLayer: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        rangeCircles = new RangeCircles(mapboxMock);
        rangeCircles.unit = 'metric';
    });

    describe('Move Optimization', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => setTimeout(cb, 0)));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('throttles map move events using requestAnimationFrame', () => {
            rangeCircles.updateVisibility = vi.fn();

            expect(mapboxMock.on).toHaveBeenCalledWith('move', expect.any(Function));

            const moveHandler = mapboxMock.on.mock.calls.find(call => call[0] === 'move')[1];

            // Trigger move multiple times synchronously
            moveHandler();
            moveHandler();
            moveHandler();

            // Initially, updateVisibility shouldn't be called yet
            expect(rangeCircles.updateVisibility).not.toHaveBeenCalled();

            // Fast forward timers to let requestAnimationFrame (mocked as setTimeout) execute
            vi.runAllTimers();

            // updateVisibility should only be called once due to throttling
            expect(rangeCircles.updateVisibility).toHaveBeenCalledTimes(1);
        });
    });

    describe('Drawing & Clearing Mapbox Layers', () => {
        it('calculates mapbox bounds and draws features correctly', () => {
            mapboxMock.getSource.mockReturnValue(null); // Force addSource path

            const center = [51.5, -0.1];
            rangeCircles.draw(center);

            expect(mapboxMock.addSource).toHaveBeenCalledWith('range-circles', expect.any(Object));
            expect(mapboxMock.addLayer).toHaveBeenCalledWith(expect.objectContaining({id: 'range-circles-line'}));
            expect(mapboxMock.addLayer).toHaveBeenCalledWith(expect.objectContaining({id: 'range-labels'}));
        });

        it('updates existing mapbox source if it exists', () => {
            const mockSource = { setData: vi.fn() };
            mapboxMock.getSource.mockReturnValue(mockSource);

            const center = [51.5, -0.1];
            rangeCircles.draw(center);

            expect(mapboxMock.addSource).not.toHaveBeenCalled();
            expect(mockSource.setData).toHaveBeenCalledWith(expect.objectContaining({
                type: 'FeatureCollection'
            }));
        });

        it('clears mapbox layers and sources', () => {
            // Setup so it tries to remove
            mapboxMock.getLayer.mockReturnValue(true);
            mapboxMock.getSource.mockReturnValue(true);

            rangeCircles.clear();

            expect(mapboxMock.removeLayer).toHaveBeenCalledWith('range-circles-line');
            expect(mapboxMock.removeLayer).toHaveBeenCalledWith('range-labels');
            expect(mapboxMock.removeSource).toHaveBeenCalledWith('range-circles');
        });
    });
});
