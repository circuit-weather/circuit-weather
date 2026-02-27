import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { TrackLayer } from '../public/src/map/TrackLayer.js';
import { CIRCUIT_MAP, CONFIG } from '../public/src/config.js';

// Mock config to allow overriding frozen properties
vi.mock('../public/src/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        CONFIG: { ...actual.CONFIG }
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
        expect(mapMock.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
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

        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(geoJsonId));
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
        expect(fetchMock).toHaveBeenCalledWith(`${CONFIG.trackApi}/${geoJsonId}.geojson`);

        // Restore
        // @ts-ignore
        CONFIG.trackApi = originalApi;
    });
});
