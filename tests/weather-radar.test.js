import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DOM
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(true) // assume visible by default for test
    },
    style: {},
    setAttribute: vi.fn(),
    textContent: ''
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
vi.stubGlobal('L', { tileLayer: vi.fn(), map: vi.fn() });
vi.stubGlobal('fetch', vi.fn());

// Mock requestAnimationFrame
let rafCallbacks = new Map();
let nextRafId = 1;
const requestAnimationFrameMock = vi.fn((cb) => {
    const id = nextRafId++;
    rafCallbacks.set(id, cb);
    return id;
});
const cancelAnimationFrameMock = vi.fn((id) => {
    rafCallbacks.delete(id);
});

vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

// Import the class under test
const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');

describe('WeatherRadar Timer Logic', () => {
    let radar;
    let mockMap;

    beforeEach(() => {
        vi.clearAllMocks();
        rafCallbacks.clear();
        nextRafId = 1;

        mockMap = {
            removeLayer: vi.fn(),
            invalidateSize: vi.fn(),
            hasLayer: vi.fn(),
            addLayer: vi.fn(),
            on: vi.fn(),
            off: vi.fn()
        };

        radar = new WeatherRadar(mockMap);
    });

    it('should cancel previous timer loop when showErrorToast is called again', async () => {
        // Setup
        radar.ui.errorToast = createMockElement('errorToast');
        radar.ui.errorTimer = createMockElement('errorTimer');
        radar.ui.errorTitle = createMockElement('errorTitle');
        radar.ui.errorMessage = createMockElement('errorMessage');

        // Initial call
        radar.showErrorToast('Title 1', 'Message 1', 60);

        expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
        // We know the ID is likely 1 because we reset nextRafId in beforeEach
        // But let's check the mock calls if needed. Or assume sequential IDs for this simple test.
        const firstLoopId = 1;

        expect(rafCallbacks.has(firstLoopId)).toBe(true);
        expect(radar.toastAnimationFrame).toBe(firstLoopId);

        // Second call - simulates updateErrorUI being called again
        radar.showErrorToast('Title 2', 'Message 2', 60);

        expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);
        const secondLoopId = 2;

        // CRITICAL ASSERTION: The first loop MUST be cancelled.
        expect(rafCallbacks.has(firstLoopId)).toBe(false);
        expect(rafCallbacks.has(secondLoopId)).toBe(true);
        expect(radar.toastAnimationFrame).toBe(secondLoopId);
    });

    it('should cancel timer loop when hiding error toast', () => {
        radar.ui.errorToast = createMockElement('errorToast');
        radar.ui.errorTimer = createMockElement('errorTimer');

        radar.showErrorToast('Title', 'Msg', 60);
        const loopId = 1;
        expect(rafCallbacks.has(loopId)).toBe(true);

        radar.hideErrorToast();

        expect(rafCallbacks.has(loopId)).toBe(false);
        expect(radar.toastAnimationFrame).toBe(null);
    });

    it('should correctly calculate duration in updateErrorUI', () => {
        // Mock rate limit
        const now = 1000000;
        vi.setSystemTime(now);

        radar.rateLimitResetTime = now + 45000; // 45s in future
        radar.failedTiles = new Set(['tile1']);

        // Spy on showErrorToast
        const toastSpy = vi.spyOn(radar, 'showErrorToast');

        radar.updateErrorUI();

        expect(toastSpy).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining('Retrying 1 failed tile'),
            45 // Duration should be 45
        );

        vi.useRealTimers();
    });

    it('should cancel hideErrorTimer when updateErrorUI is called with errors', () => {
        vi.useFakeTimers();

        // Start with no errors to create the timer
        radar.failedTiles = new Set();
        radar.updateErrorUI();

        expect(radar.hideErrorTimer).not.toBeNull();

        // Introduce errors
        radar.failedTiles = new Set(['tile1']);
        radar.updateErrorUI();

        // The timer should be cleared
        expect(radar.hideErrorTimer).toBeNull();

        vi.useRealTimers();
    });

    it('should call hideErrorToast from within hideErrorTimer', () => {
        vi.useFakeTimers();

        radar.failedTiles = new Set();
        const hideErrorToastSpy = vi.spyOn(radar, 'hideErrorToast').mockImplementation(() => {});

        radar.updateErrorUI();

        expect(radar.hideErrorTimer).not.toBeNull();

        vi.advanceTimersByTime(1000);

        expect(hideErrorToastSpy).toHaveBeenCalled();
        expect(radar.hideErrorTimer).toBeNull();

        vi.useRealTimers();
    });
});

describe('waitForTilesToLoad', () => {
    let radar;
    let mockMap;

    beforeEach(() => {
        vi.clearAllMocks();
        mockMap = {
            hasLayer: vi.fn(),
            addLayer: vi.fn(),
        };
        radar = new WeatherRadar(mockMap);
        radar.currentFrame = 0;
        vi.spyOn(radar, 'showFrame').mockImplementation(() => {});
    });

    it('resolves immediately if no current layer exists', async () => {
        vi.spyOn(radar, 'getLayer').mockReturnValue(null);

        const result = await radar.waitForTilesToLoad();
        expect(result).toBeUndefined();
    });


    it('adds layer to mapbox map and resolves via fallback if layer does not fire load', async () => {
        const mockLayer = {
            id: 'mockLayer-id',
            addTo: vi.fn(), // Code calls this.map.hasLayer/getLayer but then calls currentLayer.addTo(this.map) in both branches
            on: vi.fn(),
            off: vi.fn()
        };

        // Use a localized mockMap specifically for this test
        const localMockMap = {
            addLayer: vi.fn(),
            getLayer: vi.fn().mockReturnValue(false)
        };

        radar.map = localMockMap;
        vi.spyOn(radar, 'getLayer').mockReturnValue(mockLayer);

        vi.useFakeTimers();
        try {
            const promise = radar.waitForTilesToLoad();

            // Advance by fallback timeout
            vi.advanceTimersByTime(30000);
            await promise;

            expect(localMockMap.getLayer).toHaveBeenCalledWith('mockLayer-id');
            expect(mockLayer.addTo).toHaveBeenCalledWith(localMockMap);
            expect(radar.showFrame).toHaveBeenCalledWith(0);
        } finally {
            vi.useRealTimers();
            // Restore radar map to the outer mockMap
            radar.map = mockMap;
        }
    });

    it('adds layer to map and resolves on load event', async () => {
        const mockLayer = {
            addTo: vi.fn(),
            on: vi.fn((event, callback) => {
                if (event === 'load') {
                    // Simulate async load event
                    setTimeout(callback, 10);
                }
            }),
            off: vi.fn()
        };
        vi.spyOn(radar, 'getLayer').mockReturnValue(mockLayer);
        mockMap.hasLayer.mockReturnValue(false);

        vi.useFakeTimers();
        const promise = radar.waitForTilesToLoad();
        vi.advanceTimersByTime(10);
        await promise;

        expect(mockMap.hasLayer).toHaveBeenCalledWith(mockLayer);
        expect(mockLayer.addTo).toHaveBeenCalledWith(mockMap);
        expect(mockLayer.off).toHaveBeenCalledWith('load', expect.any(Function));
        expect(radar.showFrame).toHaveBeenCalledWith(0);

        vi.useRealTimers();
    });

    it('resolves via setTimeout fallback if load event is not triggered', async () => {
        const mockLayer = {
            addTo: vi.fn(),
            on: vi.fn(), // load event never triggered
            off: vi.fn()
        };
        vi.spyOn(radar, 'getLayer').mockReturnValue(mockLayer);
        mockMap.hasLayer.mockReturnValue(true);

        vi.useFakeTimers();
        const promise = radar.waitForTilesToLoad();

        // CONFIG.TILE_LOAD_TIMEOUT_MS is typically 30000
        vi.advanceTimersByTime(30000);
        await promise;

        expect(mockLayer.addTo).not.toHaveBeenCalled(); // Because hasLayer returned true
        expect(mockLayer.off).toHaveBeenCalledWith('load', expect.any(Function));
        expect(radar.showFrame).toHaveBeenCalledWith(0);

        vi.useRealTimers();
    });
});


describe('WeatherRadar Tile Error Handling', () => {
    let radar;
    let mockMapManager;

    beforeEach(() => {
        vi.stubGlobal('document', {
            getElementById: vi.fn().mockReturnValue({
                addEventListener: vi.fn(),
                classList: { add: vi.fn(), remove: vi.fn() },
                setAttribute: vi.fn(),
                style: {}
            }),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        });
        vi.stubGlobal('CONFIG', { rainViewerTheme: 1, rainViewerSmooth: 1, rainViewerSnow: 1 });
        vi.stubGlobal('i18n', { t: vi.fn() });
        vi.stubGlobal('statusManager', { showWarning: vi.fn(), hideWarning: vi.fn() });
        mockMapManager = { map: {} };
        radar = new WeatherRadar(mockMapManager);
        // Mock L.tileLayer
        vi.stubGlobal('L', {
            tileLayer: vi.fn().mockReturnValue({
                on: vi.fn(),
                setOpacity: vi.fn(),
                addTo: vi.fn(),
                remove: vi.fn()
            })
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should delete from failedTiles and updateErrorUI on tileunload if it was failed', () => {
        vi.spyOn(radar, 'updateErrorUI').mockImplementation(() => {});
        const layer = radar.createLayer({ path: 'test', time: 100 });
        const onTileUnload = layer.on.mock.calls.find(call => call[0] === 'tileunload')[1];

        const mockTile = {};
        radar.failedTiles.add(mockTile);

        onTileUnload({ tile: mockTile });

        expect(radar.failedTiles.has(mockTile)).toBe(false);
        expect(radar.updateErrorUI).toHaveBeenCalled();
    });


    it('should delete from failedTiles and updateErrorUI on tileload if it was failed', () => {
        vi.spyOn(radar, 'updateErrorUI').mockImplementation(() => {});
        const layer = radar.createLayer({ path: 'test', time: 100 });
        const onTileLoad = layer.on.mock.calls.find(call => call[0] === 'tileload')[1];

        const mockTile = {};
        radar.failedTiles.add(mockTile);

        onTileLoad({ tile: mockTile });

        expect(radar.failedTiles.has(mockTile)).toBe(false);
        expect(radar.updateErrorUI).toHaveBeenCalled();
    });

    it('should call handleTileError on tileerror', () => {
        const handleTileErrorSpy = vi.spyOn(radar, 'handleTileError').mockImplementation(() => {});
        const layer = radar.createLayer({ path: 'test', time: 100 });
        const onTileError = layer.on.mock.calls.find(call => call[0] === 'tileerror')[1];

        const mockEvent = { tile: {} };
        onTileError(mockEvent);

        expect(handleTileErrorSpy).toHaveBeenCalledWith(mockEvent);
    });
});
