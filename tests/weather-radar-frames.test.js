import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Global Mocks (same pattern as weather-radar.test.js) ---
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(true),
    },
    style: {},
    setAttribute: vi.fn(),
    textContent: '',
    value: '',
});

const documentMock = {
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    activeElement: { tagName: 'BODY' },
    createElement: vi.fn(() => createMockElement('created')),
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

vi.stubGlobal('L', {
    tileLayer: vi.fn(() => createMockLayer()),
    map: vi.fn(),
});

// Import the class under test
const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');

describe('WeatherRadar Frame & Speed Logic', () => {
    let radar;
    let mockMap;

    beforeEach(() => {
        vi.clearAllMocks();

        mockMap = {
            removeLayer: vi.fn(),
            invalidateSize: vi.fn(),
            hasLayer: vi.fn().mockReturnValue(false),
            addLayer: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
        };

        radar = new WeatherRadar(mockMap);

        // Mock UI elements
        radar.ui.slider = createMockElement('radarSlider');
        radar.ui.time = createMockElement('radarTime');
    });

    // ---------------------------------------------------------------
    // showFrame
    // ---------------------------------------------------------------
    describe('showFrame', () => {
        it('does nothing if index is out of bounds (negative)', () => {
            radar.frames = [{ time: 100, path: '/p1' }];
            radar.showFrame(-1);
            expect(radar.visibleLayerIndex).toBe(-1);
        });

        it('does nothing if index exceeds frames length', () => {
            radar.frames = [{ time: 100, path: '/p1' }];
            radar.showFrame(5);
            expect(radar.visibleLayerIndex).toBe(-1);
        });

        it('skips if already showing the same frame', () => {
            const layer = createMockLayer();
            radar.frames = [{ time: 100, path: '/p1' }];
            radar.layers = [layer];
            radar.visibleLayerIndex = 0;

            radar.showFrame(0);

            // Should not call addTo or setOpacity since it's already visible
            expect(layer.setOpacity).not.toHaveBeenCalled();
        });

        it('shows the requested frame and hides the previous one', () => {
            const layer0 = createMockLayer();
            const layer1 = createMockLayer();
            radar.frames = [
                { time: 100, path: '/p1' },
                { time: 200, path: '/p2' },
            ];
            radar.layers = [layer0, layer1];
            radar.visibleLayerIndex = 0;

            // Layer0 is currently visible, show frame 1
            mockMap.hasLayer.mockImplementation((l) => l === layer0);

            radar.showFrame(1);

            // Previous layer hidden
            expect(layer0.setOpacity).toHaveBeenCalledWith(0);

            // New layer shown with radar opacity
            expect(layer1.addTo).toHaveBeenCalledWith(mockMap);

            // State updated
            expect(radar.visibleLayerIndex).toBe(1);
        });

        it('preloads the next frame at opacity 0', () => {
            const layer0 = createMockLayer();
            const layer1 = createMockLayer();
            radar.frames = [
                { time: 100, path: '/p1' },
                { time: 200, path: '/p2' },
            ];
            radar.layers = [layer0, layer1];

            // Show frame 0, next is frame 1
            mockMap.hasLayer.mockReturnValue(false);

            radar.showFrame(0);

            // Frame 1 should be added to map at opacity 0
            expect(layer1.addTo).toHaveBeenCalledWith(mockMap);
            expect(layer1.setOpacity).toHaveBeenCalledWith(0);
        });

        it('updates slider value to current frame index', () => {
            const layer0 = createMockLayer();
            radar.frames = [{ time: 100, path: '/p1' }];
            radar.layers = [layer0];

            radar.showFrame(0);

            expect(radar.ui.slider.value).toBe(0);
        });
    });

    // ---------------------------------------------------------------
    // cycleSpeed
    // ---------------------------------------------------------------
    describe('cycleSpeed', () => {
        it('increments speedIndex', () => {
            const initialIndex = radar.playback.speedIndex;
            radar.playback.cycleSpeed();
            expect(radar.playback.speedIndex).toBe(initialIndex + 1);
        });

        it('wraps around to 0 when at the last speed', () => {
            // Set to last index
            // CONFIG.radarSpeeds is imported inside WeatherRadar, we need to figure out its length
            // We can infer from speeedIndex wrapping
            let cycleCount = 0;

            // Cycle until we wrap back to 0
            do {
                radar.playback.cycleSpeed();
                cycleCount++;
                if (cycleCount > 20) break; // Safety limit
            } while (radar.playback.speedIndex !== 0);

            expect(radar.playback.speedIndex).toBe(0);
            expect(cycleCount).toBeGreaterThan(1); // Proves there were multiple speeds
        });

        it('restarts playback if currently playing', () => {
            const pauseSpy = vi.spyOn(radar.playback, 'pause').mockImplementation(() => {
                radar.playback.isPlaying = false;
            });
            const playSpy = vi.spyOn(radar.playback, 'play').mockImplementation(() => {
                radar.playback.isPlaying = true;
            });

            radar.playback.isPlaying = true;
            radar.playback.cycleSpeed();

            expect(pauseSpy).toHaveBeenCalled();
            expect(playSpy).toHaveBeenCalled();
        });

        it('does not restart playback if not playing', () => {
            const pauseSpy = vi.spyOn(radar.playback, 'pause').mockImplementation(() => { });
            const playSpy = vi.spyOn(radar.playback, 'play').mockImplementation(() => { });

            radar.playback.isPlaying = false;
            radar.playback.cycleSpeed();

            expect(pauseSpy).not.toHaveBeenCalled();
            expect(playSpy).not.toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // handleTileError
    // ---------------------------------------------------------------
    describe('handleTileError', () => {
        it('adds tile to failedTiles set', () => {
            const tile = { src: 'http://example.com/tile.png' };
            // Provide a fetch mock so the HEAD check inside handleTileError doesn't fail
            global.fetch.mockResolvedValueOnce({ status: 200, ok: true });
            radar.errorToast.handleTileError({ tile });
            expect(radar.errorToast.failedTiles.has(tile)).toBe(true);
        });

        it('triggers rate limit cooldown on HTTP 429', async () => {
            const cooldownSpy = vi.spyOn(radar.errorToast, 'triggerRateLimitCooldown').mockImplementation(() => { });
            global.fetch.mockResolvedValueOnce({ status: 429, ok: false });

            radar.errorToast.handleTileError({ tile: {} });

            // Wait for the fetch promise chain
            await vi.waitFor(() => expect(cooldownSpy).toHaveBeenCalled());
        });

        it('shows connection instability toast on 200 (API ok but tile failed)', async () => {
            const cooldownSpy = vi.spyOn(radar.errorToast, 'triggerRateLimitCooldown').mockImplementation(() => { });
            global.fetch.mockResolvedValueOnce({ status: 200, ok: true });

            radar.errorToast.handleTileError({ tile: {} });

            await vi.waitFor(() => {
                expect(cooldownSpy).toHaveBeenCalledWith(
                    15000,
                    'Connection Instability',
                    expect.stringContaining('Retrying')
                );
            });
        });

        it('shows service error toast on non-429 error status', async () => {
            const toastSpy = vi.spyOn(radar.errorToast, 'showErrorToast').mockImplementation(() => { });
            global.fetch.mockResolvedValueOnce({ status: 503, ok: false });

            radar.errorToast.handleTileError({ tile: {} });

            await vi.waitFor(() => {
                expect(toastSpy).toHaveBeenCalledWith(
                    'Service Error',
                    expect.stringContaining('503'),
                    5
                );
            });
        });

        it('skips status check if one is already in progress', () => {
            radar.errorToast.isCheckingStatus = true;
            const tile = { src: 'test' };

            radar.errorToast.handleTileError({ tile });

            // Tile should still be tracked
            expect(radar.errorToast.failedTiles.has(tile)).toBe(true);
            // But no fetch should be made
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('calls updateErrorUI on network error', async () => {
            const uiSpy = vi.spyOn(radar.errorToast, 'updateErrorUI').mockImplementation(() => { });
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            global.fetch.mockRejectedValueOnce(new Error('offline'));

            radar.errorToast.handleTileError({ tile: {} });

            try {
                await vi.waitFor(() => {
                    expect(uiSpy).toHaveBeenCalled();
                });
            } finally {
                errorSpy.mockRestore();
            }
        });
    });
});
