import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Leaflet before import
const layerMock = {
    addTo: vi.fn(),
    setStyle: vi.fn(),
    bringToBack: vi.fn(),
    remove: vi.fn(),
};

// Mock L.geoJSON constructor
const geoJSONMock = vi.fn(() => layerMock);

vi.stubGlobal('L', {
    geoJSON: geoJSONMock,
});

// Mock fetch
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Mock DOM APIs
const getPropertyValueMock = vi.fn();
const getComputedStyleMock = vi.fn(() => ({
    getPropertyValue: getPropertyValueMock
}));
vi.stubGlobal('getComputedStyle', getComputedStyleMock);

// Mock document
const documentMock = {
    documentElement: {
        getAttribute: vi.fn(),
        style: {
             getPropertyValue: vi.fn()
        }
    }
};
vi.stubGlobal('document', documentMock);

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));

import { TrackLayer } from '../public/src/map/TrackLayer.js';
import { CIRCUIT_MAP, CONFIG } from '../public/src/config.js';

// Mock config to allow overriding frozen properties
vi.mock('../public/src/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        CONFIG: {
            ...actual.CONFIG,
            MIN_POLL_DELAY_MS: 30000
        }
    };
});

describe('TrackLayer', () => {
    let trackLayer;
    let mapMock;

    beforeEach(() => {
        vi.clearAllMocks();

        mapMock = {
            on: vi.fn(),
            off: vi.fn(),
            getZoom: vi.fn().mockReturnValue(10), // Default zoom
            hasLayer: vi.fn().mockReturnValue(false),
            addLayer: vi.fn(),
            removeLayer: vi.fn(),
        };

        // Default mock behaviors
        getPropertyValueMock.mockReturnValue(''); // No CSS variable by default
        documentMock.documentElement.getAttribute.mockReturnValue('light'); // Light theme

        trackLayer = new TrackLayer(mapMock);
    });

    it('should initialize and bind events', () => {
        expect(mapMock.on).toHaveBeenCalledWith('moveend', expect.any(Function));
        // Check initial color resolution
        expect(trackLayer.trackColor).toBe('#e10600'); // Light theme fallback
    });

    it('should resolve track color from CSS variable if available', () => {
        getPropertyValueMock.mockReturnValue(' #123456 ');
        trackLayer = new TrackLayer(mapMock);
        expect(trackLayer.trackColor).toBe('#123456');
    });

    it('should resolve track color from theme fallback', () => {
        // Dark theme
        documentMock.documentElement.getAttribute.mockReturnValue('dark');
        trackLayer = new TrackLayer(mapMock);
        expect(trackLayer.trackColor).toBe('#ff6b5b');

        // Light theme
        documentMock.documentElement.getAttribute.mockReturnValue('light');
        trackLayer = new TrackLayer(mapMock);
        expect(trackLayer.trackColor).toBe('#e10600');
    });

    it('should update theme and style', () => {
        // Initial setup
        trackLayer.layer = layerMock;

        // Change to dark theme
        documentMock.documentElement.getAttribute.mockReturnValue('dark');

        trackLayer.updateTheme();

        expect(trackLayer.trackColor).toBe('#ff6b5b');
        expect(layerMock.setStyle).toHaveBeenCalledWith(expect.objectContaining({
            color: '#ff6b5b'
        }));
    });

    it('should update style based on zoom level', () => {
        trackLayer.layer = layerMock;

        // Zoom 12 -> Weight 5
        mapMock.getZoom.mockReturnValue(12);
        trackLayer.updateStyle();
        expect(layerMock.setStyle).toHaveBeenCalledWith(expect.objectContaining({ weight: 5 }));

        // Zoom 10 -> Weight 4
        mapMock.getZoom.mockReturnValue(10);
        trackLayer.updateStyle();
        expect(layerMock.setStyle).toHaveBeenCalledWith(expect.objectContaining({ weight: 4 }));

        // Zoom 8 -> Weight 2
        mapMock.getZoom.mockReturnValue(8);
        trackLayer.updateStyle();
        expect(layerMock.setStyle).toHaveBeenCalledWith(expect.objectContaining({ weight: 2 }));

        // Zoom < 8 -> Weight 1
        mapMock.getZoom.mockReturnValue(5);
        trackLayer.updateStyle();
        expect(layerMock.setStyle).toHaveBeenCalledWith(expect.objectContaining({ weight: 1 }));
    });

    it('should load track successfully', async () => {
        const circuitId = 'monaco';
        const geoJsonId = CIRCUIT_MAP[circuitId];
        const mockData = { type: 'FeatureCollection', features: [] };

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => mockData
        });

        await trackLayer.loadTrack(circuitId);

        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(geoJsonId), expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(L.geoJSON).toHaveBeenCalledWith(mockData, expect.any(Object));
        expect(layerMock.addTo).toHaveBeenCalledWith(mapMock);
        expect(layerMock.bringToBack).toHaveBeenCalled();
        expect(trackLayer.cache.has(circuitId)).toBe(true);
    });

    it('should use cached track if available', async () => {
        const circuitId = 'monaco';
        // Pre-populate cache
        trackLayer.cache.set(circuitId, layerMock);

        await trackLayer.loadTrack(circuitId);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(layerMock.addTo).toHaveBeenCalledWith(mapMock); // Should add if not on map
        expect(layerMock.bringToBack).toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
        const circuitId = 'monaco';
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 404
        });
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await trackLayer.loadTrack(circuitId);

        expect(trackLayer.layer).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load track layout:', expect.any(Error));
    });

    it('should abort rendering if circuit ID changes during fetch', async () => {
         const circuitId = 'monaco';
         let resolveFetch;
         const fetchPromise = new Promise(r => { resolveFetch = r; });

         fetchMock.mockReturnValue(fetchPromise);

         const loadPromise = trackLayer.loadTrack(circuitId);

         // Change circuit ID while fetching
         trackLayer.currentCircuitId = 'other';

         resolveFetch({
             ok: true,
             json: async () => ({})
         });

         await loadPromise;

         // Should not have created a layer
         expect(L.geoJSON).not.toHaveBeenCalled();
    });

    it('should clear existing layer', () => {
        trackLayer.layer = layerMock;
        trackLayer.clear();

        expect(mapMock.removeLayer).toHaveBeenCalledWith(layerMock);
        expect(trackLayer.layer).toBeNull();
        expect(trackLayer.currentCircuitId).toBeNull();
    });

    it('should handle unknown circuit ID', async () => {
        await trackLayer.loadTrack('non_existent_circuit');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should support full URL for trackApi (GitHub mode)', async () => {
        const originalApi = CONFIG.trackApi;
        // @ts-ignore - overriding for test
        CONFIG.trackApi = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits';

        const circuitId = 'monaco';
        const geoJsonId = CIRCUIT_MAP[circuitId];
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ type: 'FeatureCollection', features: [] })
        });

        await trackLayer.loadTrack(circuitId);

        // Should include .geojson extension in GitHub mode
        expect(fetchMock).toHaveBeenCalledWith(`${CONFIG.trackApi}/${geoJsonId}.geojson`, expect.objectContaining({ signal: expect.any(AbortSignal) }));

        // Restore
        // @ts-ignore
        CONFIG.trackApi = originalApi;
    });

    it('should not add to map if already has layer when using cache', async () => {
        const circuitId = 'monaco';
        trackLayer.cache.set(circuitId, layerMock);
        mapMock.hasLayer.mockReturnValue(true);

        await trackLayer.loadTrack(circuitId);

        expect(layerMock.addTo).not.toHaveBeenCalled();
        expect(layerMock.bringToBack).toHaveBeenCalled();
    });

    it('should return early when updateStyle is called but layer is null', () => {
        trackLayer.layer = null;
        trackLayer.updateStyle();
        // Nothing should throw
        expect(true).toBe(true);
    });

    it('should handle fetch success but changed circuit ID before json parsing', async () => {
         const circuitId = 'monaco';
         let resolveFetch;
         const fetchPromise = new Promise(r => { resolveFetch = r; });

         fetchMock.mockReturnValue(fetchPromise);

         const loadPromise = trackLayer.loadTrack(circuitId);

         resolveFetch({
             ok: true,
             json: async () => {
                 trackLayer.currentCircuitId = 'other';
                 return {};
             }
         });

         await loadPromise;

         expect(L.geoJSON).not.toHaveBeenCalled();
    });

    it('should abort cached load if circuit ID changes during cache check', async () => {
        const circuitId = 'monaco';
        trackLayer.cache.set(circuitId, layerMock);

        // We can simulate the race condition by changing the circuit ID immediately after calling loadTrack
        // Since loadTrack is async, the first part runs synchronously up to the first await.
        // Wait, cache check is completely synchronous now in TrackLayer.js!
        // `if (this.cache.has(circuitId)) { if (this.currentCircuitId !== circuitId) return; ... }`
        // We need to change the currentCircuitId before it reaches that check, or just after it's set.

        // Instead of overriding the Map's get method (which doesn't work if has() is called first),
        // we'll just mock mapMock.hasLayer (which is called right after) to change the ID to test the abort logic.
        // Actually, the new implementation checks:
        // if (this.cache.has(circuitId)) {
        //     if (this.currentCircuitId !== circuitId) return;
        //     // Mapbox logic ...
        //     this.layer = this.cache.get(circuitId);

        const originalHas = trackLayer.cache.has.bind(trackLayer.cache);
        trackLayer.cache.has = vi.fn().mockImplementation((id) => {
            // Change ID during the has() check, before it verifies
            trackLayer.currentCircuitId = 'changed';
            return originalHas(id);
        });

        await trackLayer.loadTrack(circuitId);

        expect(layerMock.addTo).not.toHaveBeenCalled();
    });
});

describe('Mapbox Environment', () => {
    let trackLayer;
    let mapboxMapMock;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();

        mapboxMapMock = {
            on: vi.fn(),
            off: vi.fn(),
            getZoom: vi.fn().mockReturnValue(10),
            // No hasLayer means isMapbox = true
            getLayer: vi.fn((id) => trackLayer.mapboxLayers?.has(id)),
            getSource: vi.fn((id) => trackLayer.mapboxSources?.has(id)),
            setPaintProperty: vi.fn(),
            addSource: vi.fn((id) => {
                trackLayer.mapboxSources = trackLayer.mapboxSources || new Set();
                trackLayer.mapboxSources.add(id);
            }),
            addLayer: vi.fn((layer) => {
                trackLayer.mapboxLayers = trackLayer.mapboxLayers || new Set();
                trackLayer.mapboxLayers.add(layer.id);
            }),
            removeLayer: vi.fn((id) => {
                trackLayer.mapboxLayers?.delete(id);
            }),
        };

        trackLayer = new TrackLayer(mapboxMapMock);
        trackLayer.mapboxLayers = new Set();
        trackLayer.mapboxSources = new Set();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should bind events for mapbox using requestAnimationFrame', () => {
        expect(mapboxMapMock.on).toHaveBeenCalledWith('move', expect.any(Function));

        const moveCallback = mapboxMapMock.on.mock.calls.find(call => call[0] === 'move')[1];
        trackLayer.updateStyle = vi.fn();

        moveCallback(); // Sets up RAF
        expect(trackLayer.updateStyle).not.toHaveBeenCalled(); // Debounced

        vi.advanceTimersByTime(0); // Trigger RAF
        expect(trackLayer.updateStyle).toHaveBeenCalled();

        // Second call while RAF is pending should be ignored
        trackLayer.updateStyle.mockClear();
        moveCallback();
        moveCallback();
        vi.advanceTimersByTime(0);
        expect(trackLayer.updateStyle).toHaveBeenCalledTimes(1);
    });

    it('should update style when layer exists', () => {
        trackLayer.currentCircuitId = 'monaco';
        trackLayer.mapboxLayers.add('track-layer-monaco');
        trackLayer.trackColor = '#123456';

        trackLayer.updateStyle();

        expect(mapboxMapMock.setPaintProperty).toHaveBeenCalledWith('track-layer-monaco', 'line-width', 4);
        expect(mapboxMapMock.setPaintProperty).toHaveBeenCalledWith('track-layer-monaco', 'line-color', '#123456');
    });

    it('should trigger reload if layer is missing during updateStyle', () => {
        trackLayer.currentCircuitId = 'monaco';
        // Layer missing because we didn't add it to mapboxLayers
        trackLayer.loadTrack = vi.fn();

        trackLayer.updateStyle();

        expect(trackLayer.loadTrack).toHaveBeenCalledWith('monaco');
    });

    it('should load track and add to mapbox successfully', async () => {
        const circuitId = 'monaco';
        const mockData = { type: 'FeatureCollection', features: [] };

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => mockData
        });

        await trackLayer.loadTrack(circuitId);

        expect(mapboxMapMock.addSource).toHaveBeenCalledWith(`track-source-${circuitId}`, expect.objectContaining({
            type: 'geojson',
            data: mockData
        }));
        expect(mapboxMapMock.addLayer).toHaveBeenCalledWith(expect.objectContaining({
            id: `track-layer-${circuitId}`,
            type: 'line',
            source: `track-source-${circuitId}`
        }));
        expect(trackLayer.cache.has(circuitId)).toBe(true);
    });

    it('should load track from cache for mapbox', async () => {
        const circuitId = 'monaco';
        const mockData = { type: 'FeatureCollection', features: [] };
        trackLayer.cache.set(circuitId, mockData);

        await trackLayer.loadTrack(circuitId);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(mapboxMapMock.addSource).toHaveBeenCalledWith(`track-source-${circuitId}`, expect.objectContaining({
            type: 'geojson',
            data: mockData
        }));
        expect(mapboxMapMock.addLayer).toHaveBeenCalledWith(expect.objectContaining({
            id: `track-layer-${circuitId}`,
            type: 'line',
            source: `track-source-${circuitId}`
        }));
    });

    it('should not add source/layer again if they exist when loading from cache', async () => {
        const circuitId = 'monaco';
        const mockData = { type: 'FeatureCollection', features: [] };
        trackLayer.cache.set(circuitId, mockData);
        trackLayer.mapboxSources.add(`track-source-${circuitId}`);
        trackLayer.mapboxLayers.add(`track-layer-${circuitId}`);

        await trackLayer.loadTrack(circuitId);

        expect(mapboxMapMock.addSource).not.toHaveBeenCalled();
        expect(mapboxMapMock.addLayer).not.toHaveBeenCalled();
    });

    it('should clear mapbox layer if currentCircuitId is set', () => {
        trackLayer.currentCircuitId = 'monaco';
        trackLayer.mapboxLayers.add('track-layer-monaco');

        trackLayer.clear();

        expect(mapboxMapMock.removeLayer).toHaveBeenCalledWith('track-layer-monaco');
        expect(trackLayer.currentCircuitId).toBeNull();
    });
});
