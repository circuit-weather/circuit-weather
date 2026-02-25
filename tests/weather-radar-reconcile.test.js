import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Global Mocks ---
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(true)
    },
    style: {},
    textContent: '',
    value: ''
});

const documentMock = {
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    activeElement: { tagName: 'BODY' },
    createElement: vi.fn(() => createMockElement('created'))
};

const navigatorMock = { language: 'en-US' };

vi.stubGlobal('document', documentMock);
vi.stubGlobal('navigator', navigatorMock);
vi.stubGlobal('window', { addEventListener: vi.fn() });
vi.stubGlobal('fetch', vi.fn());
vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => 1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

// Mock Leaflet
const createMockLayer = () => ({
    addTo: vi.fn(),
    setOpacity: vi.fn(),
    setZIndex: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
});

const mapMock = {
    removeLayer: vi.fn(),
    invalidateSize: vi.fn(),
    hasLayer: vi.fn(),
    addLayer: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
};

vi.stubGlobal('L', {
    tileLayer: vi.fn(() => createMockLayer()),
    map: vi.fn(() => mapMock)
});

// Import Class Under Test
const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');

describe('WeatherRadar Layer Reconciliation', () => {
    let radar;

    beforeEach(() => {
        vi.clearAllMocks();
        radar = new WeatherRadar(mapMock);

        // Mock UI elements that might be accessed
        radar.ui.slider = createMockElement('radarSlider');
        radar.ui.time = createMockElement('radarTime');
    });

    describe('reconcileLayers', () => {
        it('should create new slots as null when no existing layers match', () => {
            // Arrange
            const newFrames = [
                { time: 100, path: '/path1' },
                { time: 200, path: '/path2' }
            ];

            // Act
            radar.reconcileLayers(newFrames);

            // Assert
            expect(radar.layers).toHaveLength(2);
            expect(radar.layers[0]).toBeNull(); // Lazy loaded
            expect(radar.layers[1]).toBeNull();
            expect(radar.visibleLayerIndex).toBe(-1);
        });

        it('should reuse existing layers that match time and path', () => {
            // Arrange
            const frame1 = { time: 100, path: '/path1' };
            const frame2 = { time: 200, path: '/path2' };

            // Pre-populate layers manually
            const layer1 = createMockLayer();
            layer1.frameTime = 100;
            layer1.framePath = '/path1';

            const layer2 = createMockLayer();
            layer2.frameTime = 200;
            layer2.framePath = '/path2';

            radar.layers = [layer1, layer2];
            radar.frames = [frame1, frame2];

            // New frames (same content, maybe different order or subset)
            const newFrames = [frame2, frame1];

            // Act
            radar.reconcileLayers(newFrames);

            // Assert
            expect(radar.layers).toHaveLength(2);
            // Index 0 in newFrames is frame2, so it should have layer2
            expect(radar.layers[0]).toBe(layer2);
            // Index 1 in newFrames is frame1, so it should have layer1
            expect(radar.layers[1]).toBe(layer1);

            // Verify z-index updates
            expect(layer2.setZIndex).toHaveBeenCalledWith(100 + 0);
            expect(layer1.setZIndex).toHaveBeenCalledWith(100 + 1);
        });

        it('should remove unused layers from the map', () => {
            // Arrange
            const frame1 = { time: 100, path: '/path1' };
            const layer1 = createMockLayer();
            layer1.frameTime = 100;
            layer1.framePath = '/path1';

            radar.layers = [layer1];
            radar.frames = [frame1];

            // New frames (empty, so layer1 is unused)
            const newFrames = [];

            // Act
            radar.reconcileLayers(newFrames);

            // Assert
            expect(radar.layers).toHaveLength(0);
            expect(mapMock.removeLayer).toHaveBeenCalledWith(layer1);
        });

        it('should update visibleLayerIndex if the visible layer is reused', () => {
            // Arrange
            const frame1 = { time: 100, path: '/path1' };
            const frame2 = { time: 200, path: '/path2' };

            const layer1 = createMockLayer();
            layer1.frameTime = 100;
            layer1.framePath = '/path1';

            const layer2 = createMockLayer();
            layer2.frameTime = 200;
            layer2.framePath = '/path2';

            radar.layers = [layer1, layer2];
            radar.frames = [frame1, frame2];
            radar.visibleLayerIndex = 1; // layer2 is visible

            // New frames: only frame2 remains
            const newFrames = [frame2];

            // Act
            radar.reconcileLayers(newFrames);

            // Assert
            expect(radar.layers).toHaveLength(1);
            expect(radar.layers[0]).toBe(layer2);
            expect(radar.visibleLayerIndex).toBe(0); // layer2 is now at index 0
        });

        it('should reset visibleLayerIndex if the visible layer is removed', () => {
            // Arrange
            const frame1 = { time: 100, path: '/path1' };
            const layer1 = createMockLayer();
            layer1.frameTime = 100;
            layer1.framePath = '/path1';

            radar.layers = [layer1];
            radar.frames = [frame1];
            radar.visibleLayerIndex = 0; // layer1 is visible

            // New frames: empty
            const newFrames = [];

            // Act
            radar.reconcileLayers(newFrames);

            // Assert
            expect(radar.visibleLayerIndex).toBe(-1);
        });
    });

    describe('applyFrameUpdate', () => {
        it('should preserve the user\'s view position by timestamp', () => {
            // Arrange
            const frame1 = { time: 100, path: '/p1' };
            const frame2 = { time: 200, path: '/p2' };
            const frame3 = { time: 300, path: '/p3' };

            // Initial state: viewing frame2 (time 200)
            radar.frames = [frame1, frame2];
            radar.currentFrame = 1;

            // Mock showFrame to prevent actual layer logic
            radar.showFrame = vi.fn();

            // New frames: frame1 is gone, frame2 is now at index 0, frame3 is new
            const newFrames = [frame2, frame3];

            // Act
            radar.applyFrameUpdate(newFrames);

            // Assert
            expect(radar.frames).toEqual(newFrames);
            expect(radar.currentFrame).toBe(0); // Should track to frame2 (time 200)
            expect(radar.showFrame).toHaveBeenCalledWith(0);
        });

        it('should find the closest timestamp if exact match is gone', () => {
            // Arrange
            // Old: [100, 200, 300]. User viewing 200.
            const oldFrames = [
                { time: 100, path: '/p1' },
                { time: 200, path: '/p2' },
                { time: 300, path: '/p3' }
            ];

            radar.frames = oldFrames;
            radar.currentFrame = 1; // Viewing 200

            // New: [150, 250, 350]. 200 is gone.
            // Closest to 200 is 150 (diff 50) vs 250 (diff 50).
            // Logic: `if (diff < minDiff)` - first one wins if equal?
            // 200 - 150 = 50. 250 - 200 = 50.
            const newFrames = [
                { time: 150, path: '/p4' },
                { time: 250, path: '/p5' },
                { time: 350, path: '/p6' }
            ];

            radar.showFrame = vi.fn();

            // Act
            radar.applyFrameUpdate(newFrames);

            // Assert
            // 150 (index 0): diff 50. minDiff = 50. index = 0.
            // 250 (index 1): diff 50. 50 < 50 is false. index remains 0.
            expect(radar.currentFrame).toBe(0);
            expect(radar.showFrame).toHaveBeenCalledWith(0);
        });

        it('should default to 0 if no previous frames existed', () => {
            // Arrange
            radar.frames = [];
            radar.currentFrame = 0;
            radar.showFrame = vi.fn();

            const newFrames = [{ time: 100, path: '/p1' }];

            // Act
            radar.applyFrameUpdate(newFrames);

            // Assert
            expect(radar.currentFrame).toBe(0);
        });
    });
});
