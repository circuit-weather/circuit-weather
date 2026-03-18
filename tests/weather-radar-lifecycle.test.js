import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Global Mocks ---
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(true),
        toggle: vi.fn(),
    },
    style: {},
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
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
vi.stubGlobal('performance', { now: vi.fn(() => 0) });

// Mock Leaflet
const createMockLayer = () => ({
    addTo: vi.fn(),
    setOpacity: vi.fn(),
    setZIndex: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    redraw: vi.fn(),
});

vi.stubGlobal('L', {
    tileLayer: vi.fn(() => createMockLayer()),
});

const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');

describe('WeatherRadar Lifecycle & Playback', () => {
    let radar;
    let mockMap;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        mockMap = {
            removeLayer: vi.fn(),
            invalidateSize: vi.fn(),
            hasLayer: vi.fn().mockReturnValue(false),
            addLayer: vi.fn(),
            on: vi.fn(),
            off: vi.fn(),
        };

        radar = new WeatherRadar(mockMap);

        // Mock UI
        radar.ui.slider = createMockElement('radarSlider');
        radar.ui.time = createMockElement('radarTime');
        radar.ui.relative = createMockElement('radarRelative');
        radar.ui.timeStart = createMockElement('radarTimeStart');
        radar.ui.timeEnd = createMockElement('radarTimeEnd');
        radar.ui.controls = createMockElement('radarControls');
        radar.ui.playBtn = createMockElement('radarPlayBtn');
        radar.ui.speedLabel = createMockElement('radarSpeedLabel');
        radar.ui.speedBtn = createMockElement('radarSpeedBtn');
        radar.ui.errorToast = createMockElement('errorToast');
        radar.ui.errorTimer = createMockElement('errorTimer');
        radar.ui.errorTitle = createMockElement('errorTitle');
        radar.ui.errorMessage = createMockElement('errorMessage');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ---------------------------------------------------------------
    // getFramesFromApi — fetches and structures radar data
    // ---------------------------------------------------------------
    describe('getFramesFromApi', () => {
        it('returns combined past and nowcast frames with tile URLs', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true,
                json: () => Promise.resolve({
                    radar: {
                        past: [{ time: 100, path: '/v2/radar/100' }],
                        nowcast: [{ time: 200, path: '/v2/radar/200' }],
                    }
                })
            });

            const frames = await radar.getFramesFromApi();

            expect(frames).toHaveLength(2);
            expect(frames[0]).toEqual({
                time: 100,
                path: '/v2/radar/100',
                url: '/api/tiles/v2/radar/100/512/{z}/{x}/{y}/2/1_1.png',
            });
            expect(radar.pastFrameCount).toBe(1);
        });

        it('handles missing radar data gracefully', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true,
                json: () => Promise.resolve({})
            });

            const frames = await radar.getFramesFromApi();
            expect(frames).toHaveLength(0);
            expect(radar.pastFrameCount).toBe(0);
        });
    });

    // ---------------------------------------------------------------
    // createLayers — initialises layer slots after frame fetch
    // ---------------------------------------------------------------
    describe('createLayers', () => {
        it('creates null-filled layer array matching frames length', () => {
            radar.frames = [
                { time: 100, path: '/p1', url: '/u1' },
                { time: 200, path: '/p2', url: '/u2' },
                { time: 300, path: '/p3', url: '/u3' },
            ];

            radar.createLayers();

            expect(radar.layers).toHaveLength(3);
            expect(radar.visibleLayerIndex).toBe(-1);
            expect(radar.currentFrame).toBe(2); // Last frame
        });

        it('removes old layers from map', () => {
            const oldLayer = createMockLayer();
            radar.layers = [oldLayer];

            radar.frames = [{ time: 100, path: '/p1', url: '/u1' }];
            radar.createLayers();

            expect(mockMap.removeLayer).toHaveBeenCalledWith(oldLayer);
        });

        it('invalidates map size', () => {
            radar.frames = [{ time: 100, path: '/p1', url: '/u1' }];
            radar.createLayers();
            expect(mockMap.invalidateSize).toHaveBeenCalled();
        });

        it('clears failed tiles on rebuild', () => {
            radar.failedTiles.add('tile1');
            radar.frames = [{ time: 100, path: '/p1', url: '/u1' }];
            radar.createLayers();
            expect(radar.failedTiles.size).toBe(0);
        });
    });

    // ---------------------------------------------------------------
    // getLayer / createLayer — lazy layer creation
    // ---------------------------------------------------------------
    describe('getLayer', () => {
        it('creates a Leaflet tile layer on first access', () => {
            radar.frames = [{ time: 100, path: '/p1', url: '/api/tiles/p1' }];
            radar.layers = [null];

            const layer = radar.getLayer(0);

            expect(L.tileLayer).toHaveBeenCalledWith('/api/tiles/p1', expect.any(Object));
            expect(layer).toBeTruthy();
            expect(radar.layers[0]).toBe(layer);
        });

        it('returns cached layer on subsequent access', () => {
            radar.frames = [{ time: 100, path: '/p1', url: '/api/tiles/p1' }];
            radar.layers = [null];

            const layer1 = radar.getLayer(0);
            const layer2 = radar.getLayer(0);

            expect(L.tileLayer).toHaveBeenCalledTimes(1);
            expect(layer1).toBe(layer2);
        });

        it('returns null for out-of-bounds index', () => {
            radar.frames = [];
            expect(radar.getLayer(0)).toBeNull();
            expect(radar.getLayer(-1)).toBeNull();
        });
    });

    // ---------------------------------------------------------------
    // play / pause / togglePlay — playback state management
    // ---------------------------------------------------------------
    describe('play', () => {
        it('sets isPlaying to true and starts animation loop', () => {
            radar.frames = [{ time: 100 }];
            radar.play();

            expect(radar.isPlaying).toBe(true);
            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('adds playing class and updates ARIA on play button', () => {
            radar.play();

            expect(radar.ui.playBtn.classList.add).toHaveBeenCalledWith('playing');
            expect(radar.ui.playBtn.setAttribute).toHaveBeenCalledWith('aria-label', 'Pause radar animation');
        });

        it('applies pending frames before starting', () => {
            const applyUpdateSpy = vi.spyOn(radar, 'applyFrameUpdate').mockImplementation(() => { });
            const pendingFrames = [{ time: 300, path: '/p3' }];
            radar.pendingFrames = pendingFrames;

            radar.play();

            expect(applyUpdateSpy).toHaveBeenCalledWith(pendingFrames);
            expect(radar.pendingFrames).toBeNull();
        });
    });

    describe('pause', () => {
        it('stops animation and updates button state', () => {
            radar.isPlaying = true;
            radar.animationFrameId = 42;

            radar.pause();

            expect(radar.isPlaying).toBe(false);
            expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
            expect(radar.animationFrameId).toBeNull();
            expect(radar.ui.playBtn.classList.remove).toHaveBeenCalledWith('playing');
            expect(radar.ui.playBtn.setAttribute).toHaveBeenCalledWith('aria-label', 'Play radar animation');
        });
    });

    describe('togglePlay', () => {
        it('plays when paused', () => {
            radar.isPlaying = false;
            const playSpy = vi.spyOn(radar, 'play').mockImplementation(() => { });
            radar.togglePlay();
            expect(playSpy).toHaveBeenCalled();
        });

        it('pauses when playing', () => {
            radar.isPlaying = true;
            const pauseSpy = vi.spyOn(radar, 'pause').mockImplementation(() => { });
            radar.togglePlay();
            expect(pauseSpy).toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // load — full lifecycle
    // ---------------------------------------------------------------
    describe('load', () => {
        it('fetches frames, creates layers, and starts playback', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true,
                json: () => Promise.resolve({
                    radar: {
                        past: [{ time: 100, path: '/p1' }],
                        nowcast: [{ time: 200, path: '/p2' }],
                    }
                })
            });

            // Mock waitForTilesToLoad to resolve immediately
            vi.spyOn(radar, 'waitForTilesToLoad').mockResolvedValue();
            vi.spyOn(radar, 'preloadSequence').mockResolvedValue();

            await radar.load();

            expect(radar.frames).toHaveLength(2);
            expect(radar.isPlaying).toBe(true);
        });

        it('handles empty API response gracefully', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true,
                json: () => Promise.resolve({ radar: { past: [], nowcast: [] } })
            });

            await radar.load();

            expect(radar.frames).toHaveLength(0);
            expect(radar.isPlaying).toBe(false);
        });

        it('always starts polling even if load fails', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            global.fetch.mockRejectedValueOnce(new Error('Network Error'));
            const pollSpy = vi.spyOn(radar, 'startPolling');

            await radar.load();

            expect(pollSpy).toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    // ---------------------------------------------------------------
    // updateSlider — slider range and visual split
    // ---------------------------------------------------------------
    describe('updateSlider', () => {
        it('sets slider max to frames.length - 1', () => {
            radar.frames = [{ time: 100 }, { time: 200 }, { time: 300 }];
            radar.currentFrame = 0;
            radar.pastFrameCount = 2;

            radar.updateSlider();

            expect(radar.ui.slider.max).toBe(2);
        });

        it('displays start and end times', () => {
            radar.frames = [
                { time: 1700000000 },
                { time: 1700003600 },
            ];
            radar.currentFrame = 0;

            radar.updateSlider();

            expect(radar.ui.timeStart.textContent).toBeTruthy();
            expect(radar.ui.timeEnd.textContent).toBeTruthy();
        });

        it('shows --:-- for empty frames', () => {
            radar.frames = [];
            radar.updateSlider();

            expect(radar.ui.timeStart.textContent).toBe('--:--');
            expect(radar.ui.timeEnd.textContent).toBe('--:--');
        });
    });

    // ---------------------------------------------------------------
    // showControls — visibility toggle
    // ---------------------------------------------------------------
    describe('showControls', () => {
        it('shows controls when true', () => {
            radar.showControls(true);
            expect(radar.ui.controls.style.display).toBe('flex');
        });

        it('hides controls when false', () => {
            radar.showControls(false);
            expect(radar.ui.controls.style.display).toBe('none');
        });
    });

    // ---------------------------------------------------------------
    // triggerRateLimitCooldown — rate limit behavior
    // ---------------------------------------------------------------
    describe('triggerRateLimitCooldown', () => {
        it('sets rateLimitResetTime and shows toast', () => {
            vi.setSystemTime(1000000);
            const toastSpy = vi.spyOn(radar, 'showErrorToast').mockImplementation(() => { });

            radar.triggerRateLimitCooldown(30000, 'Rate Limited', 'Wait 30s');

            expect(radar.rateLimitResetTime).toBe(1000000 + 30000);
            expect(toastSpy).toHaveBeenCalledWith('Rate Limited', 'Wait 30s', 30);
        });

        it('does not re-trigger if already in cooldown', () => {
            vi.setSystemTime(1000000);
            radar.rateLimitResetTime = 2000000; // Already set in future

            const toastSpy = vi.spyOn(radar, 'showErrorToast').mockImplementation(() => { });
            radar.triggerRateLimitCooldown();

            expect(toastSpy).not.toHaveBeenCalled();
        });

        it('schedules tile retry after cooldown', () => {
            const retrySpy = vi.spyOn(radar, 'retryTiles').mockImplementation(() => { });
            vi.setSystemTime(1000000);

            radar.triggerRateLimitCooldown(5000);

            vi.advanceTimersByTime(5000);
            expect(retrySpy).toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // retryTiles — clears errors and redraws
    // ---------------------------------------------------------------
    describe('retryTiles', () => {
        it('clears failed tiles and resets rate limit time', () => {
            radar.failedTiles.add('t1');
            radar.failedTiles.add('t2');
            radar.rateLimitResetTime = 999999;
            radar.activeErrorTitle = 'Rate Limited';

            // Mock to prevent error from missing debounce
            vi.spyOn(radar, 'updateErrorUI').mockImplementation(() => { });

            radar.retryTiles();

            expect(radar.failedTiles.size).toBe(0);
            expect(radar.rateLimitResetTime).toBe(0);
            expect(radar.activeErrorTitle).toBeNull();
        });

        it('redraws active layers on the map', () => {
            const layer = createMockLayer();
            radar.layers = [layer];
            mockMap.hasLayer.mockReturnValue(true);
            vi.spyOn(radar, 'updateErrorUI').mockImplementation(() => { });

            radar.retryTiles();

            expect(layer.redraw).toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // updateTimeDisplay — session-relative time
    // ---------------------------------------------------------------
    describe('updateTimeDisplay', () => {
        it('shows relative time when session time is set', () => {
            radar.sessionTime = new Date(100000 * 1000); // Unix 100000
            radar.updateTimeDisplay(100000); // Same as session

            expect(radar.ui.relative.textContent).toBe('Session start');
        });

        it('shows minutes before session', () => {
            radar.sessionTime = new Date(100000 * 1000);
            // 30 minutes before
            radar.updateTimeDisplay(100000 - 30 * 60);

            expect(radar.ui.relative.textContent).toBe('30 minutes before session');
        });

        it('shows hours and minutes before session', () => {
            radar.sessionTime = new Date(100000 * 1000);
            // 90 minutes before (1h 30m)
            radar.updateTimeDisplay(100000 - 90 * 60);

            expect(radar.ui.relative.textContent).toBe('1 hour 30 minutes before session');
        });

        it('shows days, hours and minutes before session', () => {
            radar.sessionTime = new Date(100000 * 1000);
            // 2 days, 3 hours, 45 minutes before
            const mins = (2 * 24 * 60) + (3 * 60) + 45;
            radar.updateTimeDisplay(100000 - mins * 60);

            expect(radar.ui.relative.textContent).toBe('2 days 3 hours 45 minutes before session');
        });

        it('shows exactly 1 hour and 0 minutes before session', () => {
            radar.sessionTime = new Date(100000 * 1000);
            radar.updateTimeDisplay(100000 - 60 * 60);
            expect(radar.ui.relative.textContent).toBe('1 hour 0 minutes before session');
        });

        it('shows exactly 1 day and 0 minutes before session', () => {
            radar.sessionTime = new Date(100000 * 1000);
            radar.updateTimeDisplay(100000 - 24 * 60 * 60);
            expect(radar.ui.relative.textContent).toBe('1 day 0 minutes before session');
        });

        it('shows 0 minutes when very close to session start', () => {
            radar.sessionTime = new Date(100000 * 1000);
            // 10 seconds before (rounds to 0 minutes, should trigger "Session start" or "0 minutes before" depending on logic)
            // Current logic in WeatherRadar.js:
            // Math.abs(diff) < 1 -> "Session start"
            // diff < 0 -> "X before"
            // Let's test 30 seconds before (0.5 mins)
            radar.updateTimeDisplay(100000 - 30);
            expect(radar.ui.relative.textContent).toBe('Session start');
        });

        it('does nothing when timestamp is null', () => {
            radar.updateTimeDisplay(null);
            // Should not throw or modify textContent
        });

        it('shows "Forecast" when timestamp is > 60s in the future and no session time is set', () => {
             // Set system time to 100000
             const now = 100000 * 1000;
             vi.setSystemTime(now);

             // Ensure no session time
             radar.sessionTime = null;

             // Timestamp 61 seconds in the future
             const futureTimestamp = 100000 + 61;

             radar.updateTimeDisplay(futureTimestamp);

             expect(radar.ui.relative.textContent).toBe('Forecast');
             expect(radar.ui.slider.setAttribute).toHaveBeenCalledWith(
                 'aria-valuetext',
                 expect.stringContaining('Forecast')
             );
         });
    });

    // ---------------------------------------------------------------
    // getLayer - edge cases
    // ---------------------------------------------------------------
    describe('getLayer - edge cases', () => {
         it('returns null if layer index is invalid', () => {
              expect(radar.getLayer(-1)).toBeNull();
              expect(radar.getLayer(999)).toBeNull();
         });

         it('lazily creates layer if not exists', () => {
             radar.frames = [{ time: 100, path: '/p1', url: '/u1' }];
             radar.layers = [null];

             const layer = radar.getLayer(0);
             expect(layer).toBeTruthy();
             expect(radar.layers[0]).toBe(layer);
         });

         it('returns existing layer if already created', () => {
              radar.frames = [{ time: 100, path: '/p1', url: '/u1' }];
              const existingLayer = { id: 'mock' };
              radar.layers = [existingLayer];

              const layer = radar.getLayer(0);
              expect(layer).toBe(existingLayer);
         });
    });
});
