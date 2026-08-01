import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Global Mocks ---
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
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
    getBoundingClientRect: vi.fn(() => ({
        top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0
    })),
});

const documentMock = {
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
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
        radar.playback.ui.playBtn = createMockElement('radarPlayBtn');
        radar.playback.ui.speedLabel = createMockElement('radarSpeedLabel');
        radar.playback.ui.speedBtn = createMockElement('radarSpeedBtn');
        radar.errorToast.ui.errorToast = createMockElement('errorToast');
        radar.errorToast.ui.errorTimer = createMockElement('errorTimer');
        radar.errorToast.ui.errorTitle = createMockElement('errorTitle');
        radar.errorToast.ui.errorMessage = createMockElement('errorMessage');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ---------------------------------------------------------------
    // fetchAndFilter
    // ---------------------------------------------------------------
    describe('fetchAndFilter', () => {
        it('fetches frames and updates this.frames and pastFrameCount', async () => {
            const { RadarFrames } = await import('../public/src/map/RadarFrames.js');
            vi.spyOn(RadarFrames, 'getFramesFromApi').mockResolvedValue({
                frames: [{ time: 100, path: '/p1', url: '/u1' }],
                pastCount: 1
            });

            const frames = await radar.fetchAndFilter();

            expect(frames).toHaveLength(1);
            expect(radar.frames).toBe(frames);
            expect(radar.pastFrameCount).toBe(1);
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
            radar.errorToast.failedTiles.add('tile1');
            radar.frames = [{ time: 100, path: '/p1', url: '/u1' }];
            radar.createLayers();
            expect(radar.errorToast.failedTiles.size).toBe(0);
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
            radar.playback.play();

            expect(radar.playback.isPlaying).toBe(true);
            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('adds playing class and updates ARIA on play button', () => {
            radar.playback.play();

            expect(radar.playback.ui.playBtn.classList.add).toHaveBeenCalledWith('playing');
            expect(radar.playback.ui.playBtn.setAttribute).toHaveBeenCalledWith('aria-label', 'Pause radar animation');
        });

        it('applies pending frames before starting', () => {
            const applyUpdateSpy = vi.spyOn(radar, 'applyFrameUpdate').mockImplementation(() => { });
            const pendingFrames = [{ time: 300, path: '/p3' }];
            radar.pendingFrames = pendingFrames;

            radar.playback.play();

            expect(applyUpdateSpy).toHaveBeenCalledWith(pendingFrames);
            expect(radar.pendingFrames).toBeNull();
        });
    });

    describe('pause', () => {
        it('stops animation and updates button state', () => {
            radar.playback.isPlaying = true;
            radar.playback.animationFrameId = 42;

            radar.playback.pause();

            expect(radar.playback.isPlaying).toBe(false);
            expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
            expect(radar.playback.animationFrameId).toBeNull();
            expect(radar.playback.ui.playBtn.classList.remove).toHaveBeenCalledWith('playing');
            expect(radar.playback.ui.playBtn.setAttribute).toHaveBeenCalledWith('aria-label', 'Play radar animation');
        });
    });

    describe('togglePlay', () => {
        it('plays when paused', () => {
            radar.playback.isPlaying = false;
            const playSpy = vi.spyOn(radar.playback, 'play').mockImplementation(() => { });
            radar.playback.togglePlay();
            expect(playSpy).toHaveBeenCalled();
        });

        it('pauses when playing', () => {
            radar.playback.isPlaying = true;
            const pauseSpy = vi.spyOn(radar.playback, 'pause').mockImplementation(() => { });
            radar.playback.togglePlay();
            expect(pauseSpy).toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // load — full lifecycle
    // ---------------------------------------------------------------
    describe('load', () => {
        it('fetches frames, creates layers, and starts playback', async () => {
            const { RadarFrames } = await import('../public/src/map/RadarFrames.js');
            vi.spyOn(RadarFrames, 'getFramesFromApi').mockResolvedValue({
                frames: [{ time: 100, path: '/p1' }, { time: 200, path: '/p2' }],
                pastCount: 1
            });

            // Mock waitForTilesToLoad to resolve immediately
            vi.spyOn(radar, 'waitForTilesToLoad').mockResolvedValue();
            vi.spyOn(radar, 'preloadSequence').mockResolvedValue();

            await radar.load();

            expect(radar.frames).toHaveLength(2);
            expect(radar.playback.isPlaying).toBe(true);
        });

        it('handles empty API response gracefully', async () => {
            const { RadarFrames } = await import('../public/src/map/RadarFrames.js');
            vi.spyOn(RadarFrames, 'getFramesFromApi').mockResolvedValue({
                frames: [],
                pastCount: 0
            });

            await radar.load();

            expect(radar.frames).toHaveLength(0);
            expect(radar.playback.isPlaying).toBe(false);
        });

        it('always starts polling even if load fails', async () => {
            const { RadarFrames } = await import('../public/src/map/RadarFrames.js');
            vi.spyOn(RadarFrames, 'getFramesFromApi').mockRejectedValue(new Error('Network Error'));

            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
            const toastSpy = vi.spyOn(radar.errorToast, 'showErrorToast').mockImplementation(() => { });

            radar.errorToast.triggerRateLimitCooldown(30000, 'Rate Limited', 'Wait 30s');

            expect(radar.errorToast.rateLimitResetTime).toBe(1000000 + 30000);
            expect(toastSpy).toHaveBeenCalledWith('Rate Limited', 'Wait 30s', 30, radar.errorToast.rateLimitResetTime);
        });

        it('does not re-trigger if already in cooldown', () => {
            vi.setSystemTime(1000000);
            radar.errorToast.rateLimitResetTime = 2000000; // Already set in future

            const toastSpy = vi.spyOn(radar.errorToast, 'showErrorToast').mockImplementation(() => { });
            radar.errorToast.triggerRateLimitCooldown();

            expect(toastSpy).not.toHaveBeenCalled();
        });

        it('schedules tile retry after cooldown', () => {
            const retrySpy = vi.spyOn(radar.errorToast, 'retryTiles').mockImplementation(() => { });
            vi.setSystemTime(1000000);

            radar.errorToast.triggerRateLimitCooldown(5000);

            vi.advanceTimersByTime(5000);
            expect(retrySpy).toHaveBeenCalled();
        });
    });

    // ---------------------------------------------------------------
    // retryTiles — clears errors and redraws
    // ---------------------------------------------------------------
    describe('retryTiles', () => {
        it('clears failed tiles and resets rate limit time', () => {
            radar.errorToast.failedTiles.add('t1');
            radar.errorToast.failedTiles.add('t2');
            radar.errorToast.rateLimitResetTime = 999999;
            radar.errorToast.activeErrorTitle = 'Rate Limited';

            // Mock to prevent error from missing debounce
            vi.spyOn(radar.errorToast, 'updateErrorUI').mockImplementation(() => { });

            radar.errorToast.retryTiles();

            expect(radar.errorToast.failedTiles.size).toBe(0);
            expect(radar.errorToast.rateLimitResetTime).toBe(0);
            expect(radar.errorToast.activeErrorTitle).toBeNull();
        });

        it('redraws active layers on the map', () => {
            const layer = createMockLayer();
            radar.layers = [layer];
            mockMap.hasLayer.mockReturnValue(true);
            vi.spyOn(radar.errorToast, 'updateErrorUI').mockImplementation(() => { });

            radar.errorToast.retryTiles();

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

    describe('Relative Time Interval & Loop method', () => {
        it('calls updateTimeDisplay every ONE_MINUTE_MS if visibleLayerIndex is valid', () => {
            const ONE_MINUTE_MS = 60000;
            radar.visibleLayerIndex = 0;
            radar.frames = [{ time: 1000 }];

            vi.spyOn(radar, 'updateTimeDisplay').mockImplementation(() => {});

            vi.advanceTimersByTime(ONE_MINUTE_MS);

            expect(radar.updateTimeDisplay).toHaveBeenCalledWith(1000);
        });

        it('does not call updateTimeDisplay if visibleLayerIndex is invalid', () => {
            const ONE_MINUTE_MS = 60000;
            radar.visibleLayerIndex = -1;

            vi.spyOn(radar, 'updateTimeDisplay').mockImplementation(() => {});

            vi.advanceTimersByTime(ONE_MINUTE_MS);

            expect(radar.updateTimeDisplay).not.toHaveBeenCalled();
        });

        it('loop does nothing if not playing', () => {
            radar.playback.isPlaying = false;
            radar.playback.loop();
            expect(radar.playback.animationFrameId).toBeNull();
        });

        it('loop advances frame when enough time elapsed', () => {
            radar.playback.isPlaying = true;
            radar.frames = [{ time: 1000 }, { time: 2000 }];
            radar.currentFrame = 0;
            radar.playback.lastFrameTime = 0;

            vi.spyOn(radar.playback, 'getCurrentSpeed').mockReturnValue(100);
            vi.spyOn(performance, 'now').mockReturnValue(150); // > 100
            vi.spyOn(radar, 'showFrame').mockImplementation(() => {});

            radar.playback.loop();

            expect(radar.currentFrame).toBe(1);
            expect(radar.showFrame).toHaveBeenCalledWith(1);
            // 150 - (150 % 100) = 150 - 50 = 100
            expect(radar.playback.lastFrameTime).toBe(100);
        });
    });

    describe('destroy', () => {
        it('removes event listeners', () => {
            const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

            radar.destroy();

            expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', radar.handleSpaceKey);
            expect(removeEventListenerSpy).toHaveBeenCalledWith('i18n:change', radar.handleLanguageChange);
        });
    });

    describe('Additional Coverage', () => {
        it('updateTheme re-adds layers if they were on the map or visible', () => {
            // Simulate Mapbox environment by not having hasLayer method
            radar.map.hasLayer = undefined;
            radar.map.getLayer = vi.fn((id) => id === 'layer-on-map' ? {} : null);

            const mockLayerOnMap = { id: 'layer-on-map', addTo: vi.fn(), setOpacity: vi.fn() };
            const mockLayerNotOnMap = { id: 'layer-not-on-map', addTo: vi.fn(), setOpacity: vi.fn() };
            const mockLayerVisible = { id: 'layer-visible', addTo: vi.fn(), setOpacity: vi.fn() };

            // Set up 3 layers: index 0 is on map, index 1 is not, index 2 is visible
            radar.layers = [ mockLayerOnMap, mockLayerNotOnMap, mockLayerVisible ];
            radar.visibleLayerIndex = 2;

            vi.spyOn(radar, 'getLayer').mockImplementation((index) => {
                if (index === 0) return mockLayerOnMap;
                if (index === 1) return mockLayerNotOnMap;
                if (index === 2) return mockLayerVisible;
            });

            radar.updateTheme();

            // Check that radar.layers were reset to null
            expect(radar.layers).toEqual([null, null, null]);

            // Check layer 0 (was on map)
            expect(mockLayerOnMap.addTo).toHaveBeenCalledWith(radar.map);
            expect(mockLayerOnMap.setOpacity).toHaveBeenCalledWith(0);

            // Check layer 1 (not on map, not visible)
            expect(mockLayerNotOnMap.addTo).not.toHaveBeenCalled();

            // Check layer 2 (visible)
            expect(mockLayerVisible.addTo).toHaveBeenCalledWith(radar.map);
            // In tests we mock CONFIG but there's no import here. We'll verify setOpacity was called.
            expect(mockLayerVisible.setOpacity).toHaveBeenCalled();
        });

        it('updateTheme returns early if using Leaflet (hasLayer exists)', () => {
            radar.map.hasLayer = vi.fn(); // Leaflet mock
            radar.layers = [ { id: 'test' } ];

            radar.updateTheme();

            expect(radar.layers[0]).not.toBeNull();
        });

        it('formatDuration calculates correctly for >1 days, >1 hours, >1 minutes', () => {
            const minutesInDay = 24 * 60;
            const minutesInHour = 60;
            const total = (2 * minutesInDay) + (2 * minutesInHour) + 2;
            const result = radar.formatDuration(total);
            expect(result).toBe('2 days 2 hours 2 minutes');
        });

        it('togglePlay pauses if playing, plays if not playing', () => {
            const playSpy = vi.spyOn(radar.playback, 'play').mockImplementation(() => {});
            const pauseSpy = vi.spyOn(radar.playback, 'pause').mockImplementation(() => {});

            radar.playback.isPlaying = true;
            radar.playback.togglePlay();
            expect(pauseSpy).toHaveBeenCalled();

            radar.playback.isPlaying = false;
            radar.playback.togglePlay();
            expect(playSpy).toHaveBeenCalled();
        });

        it('showControls sets display flex if visible, none if not', () => {
            radar.ui.controls = createMockElement('radarControls');

            radar.showControls(true);
            expect(radar.ui.controls.style.display).toBe('flex');

            radar.showControls(false);
            expect(radar.ui.controls.style.display).toBe('none');
        });

        it('preloadSequence resolves correctly', async () => {
            radar.frames = [{time: 1}, {time: 2}];
            radar.currentFrame = 0;
            vi.spyOn(radar, 'preloadFrame').mockResolvedValue();

            await radar.preloadSequence();
            expect(radar.preloadFrame).toHaveBeenCalledWith(1);
        });

        it('preloadFrame resolves immediately if layer is null', async () => {
            vi.spyOn(radar, 'getLayer').mockReturnValue(null);

            let resolved = false;
            await radar.preloadFrame(0).then(() => { resolved = true; });
            expect(resolved).toBe(true);
        });

        it('preloadFrame resolves immediately if layer is already on map', async () => {
            const mockLayer = { setOpacity: vi.fn(), addTo: vi.fn(), on: vi.fn(), off: vi.fn() };
            vi.spyOn(radar, 'getLayer').mockReturnValue(mockLayer);
            radar.map.hasLayer.mockReturnValue(true);

            let resolved = false;
            const promise = radar.preloadFrame(0).then(() => { resolved = true; });
            vi.advanceTimersByTime(500);
            await promise;

            expect(resolved).toBe(true);
            expect(mockLayer.addTo).not.toHaveBeenCalled();
        });

        it('preloadFrame resolves after timeout if neither load nor tileerror emit', async () => {
            const mockLayer = { setOpacity: vi.fn(), addTo: vi.fn(), on: vi.fn(), off: vi.fn() };
            vi.spyOn(radar, 'getLayer').mockReturnValue(mockLayer);
            radar.map.hasLayer.mockReturnValue(false);

            let resolved = false;
            radar.preloadFrame(0).then(() => { resolved = true; });

            vi.advanceTimersByTime(30000); // CONFIG.TILE_LOAD_TIMEOUT_MS is typically 30s
            await Promise.resolve();

            expect(resolved).toBe(true);
            expect(mockLayer.off).toHaveBeenCalledWith('load', expect.any(Function));
        });
    });

    describe('handleLanguageChange Coverage', () => {
        it('updates formatters and UI components', () => {
            const updateSpeedLabelSpy = vi.spyOn(radar.playback, 'updateSpeedLabel').mockImplementation(() => {});
            const updateSliderSpy = vi.spyOn(radar, 'updateSlider').mockImplementation(() => {});
            const updateTimeDisplaySpy = vi.spyOn(radar, 'updateTimeDisplay').mockImplementation(() => {});

            radar.visibleLayerIndex = 0;
            radar.frames = [{ time: 1234567890 }];

            radar.handleLanguageChange();

            expect(radar.timeFormatter).toBeInstanceOf(Intl.DateTimeFormat);
            expect(updateSpeedLabelSpy).toHaveBeenCalled();
            expect(updateSliderSpy).toHaveBeenCalled();
            expect(updateTimeDisplaySpy).toHaveBeenCalledWith(1234567890);
        });

        it('does not update time display if no visible layer', () => {
            const updateTimeDisplaySpy = vi.spyOn(radar, 'updateTimeDisplay').mockImplementation(() => {});
            radar.visibleLayerIndex = -1;

            radar.handleLanguageChange();

            expect(updateTimeDisplaySpy).not.toHaveBeenCalled();
        });
    });

});
