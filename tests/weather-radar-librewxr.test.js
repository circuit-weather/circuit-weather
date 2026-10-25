// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG } from '../public/src/config.js';

const createMockLayer = () => ({
    addTo: vi.fn(),
    setOpacity: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    redraw: vi.fn(),
});
vi.stubGlobal('L', { tileLayer: vi.fn(() => createMockLayer()) });

const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');

const METADATA = {
    provider: 'librewxr',
    maxZoom: 12,
    radar: {
        past: [{ time: 100, path: '/v2/radar/100' }, { time: 200, path: '/v2/radar/200' }],
        nowcast: [{ time: 300, path: '/v2/radar/300' }],
    },
    satellite: { infrared: [{ time: 90, path: '/v2/satellite/90' }] },
    colorSchemes: [{ id: 2, name: 'Universal Blue' }],
};

function createLeafletMap() {
    return {
        hasLayer: vi.fn(() => false),
        removeLayer: vi.fn(),
        invalidateSize: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
    };
}

function createMapboxMap() {
    const layers = new Map();
    const sources = new Map();
    return {
        addSource: vi.fn((id, spec) => sources.set(id, spec)),
        addLayer: vi.fn((layer) => layers.set(layer.id, layer)),
        removeLayer: vi.fn((id) => layers.delete(id)),
        removeSource: vi.fn((id) => sources.delete(id)),
        getLayer: vi.fn((id) => layers.get(id)),
        getSource: vi.fn((id) => sources.get(id)),
        getStyle: vi.fn(() => ({ layers: [...layers.values()] })),
        setPaintProperty: vi.fn(),
        resize: vi.fn(),
        once: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        _sources: sources,
        _layers: layers,
    };
}

describe('WeatherRadar with LibreWXR', () => {
    let radar;

    beforeEach(() => {
        document.documentElement.setAttribute('data-theme', 'light');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => METADATA }));
        L.tileLayer.mockClear();
    });

    afterEach(() => {
        radar?.destroy();
        radar = null;
    });

    it('applies provider metadata and reports it', async () => {
        const onMetadata = vi.fn();
        radar = new WeatherRadar(createLeafletMap(), { onMetadata });

        await radar.fetchAndFilter();

        expect(radar.provider).toBe('librewxr');
        // Capped below the provider's limit of 12 to keep tile counts down
        expect(radar.maxZoom).toBe(CONFIG.RADAR_MAX_TILE_ZOOM);
        expect(radar.pastFrameCount).toBe(2);
        expect(radar.satellite.frame.url).toBe('/api/tiles/v2/satellite/90/512/{z}/{x}/{y}/0/0_0.png');
        expect(onMetadata).toHaveBeenCalledWith(expect.objectContaining({ provider: 'librewxr' }));
        expect(radar.attribution).toBe(CONFIG.RADAR_ATTRIBUTION.librewxr);
    });

    it('keeps the lower RainViewer limit when it is below the cap', async () => {
        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...METADATA, provider: 'rainviewer', maxZoom: 7 }) });
        radar = new WeatherRadar(createLeafletMap());
        await radar.fetchMetadata();
        expect(radar.maxZoom).toBe(7);
    });

    it('keeps the previous provider when the metadata has no frames', async () => {
        const onMetadata = vi.fn();
        radar = new WeatherRadar(createLeafletMap(), { onMetadata });
        fetch.mockResolvedValueOnce({ ok: false, status: 502 });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await radar.fetchMetadata();

        expect(radar.provider).toBeNull();
        expect(radar.maxZoom).toBe(CONFIG.RADAR_FALLBACK_MAX_ZOOM);
        expect(radar.attribution).toBe(CONFIG.RADAR_ATTRIBUTION.rainviewer);
        expect(onMetadata).not.toHaveBeenCalled();
    });

    it('uses the capped zoom limit for Leaflet layers', async () => {
        radar = new WeatherRadar(createLeafletMap());
        await radar.fetchAndFilter();
        radar.createLayers();

        // Starts on the latest observed frame, not the end of the nowcast
        expect(radar.currentFrame).toBe(1);
        expect(L.tileLayer).toHaveBeenCalledWith(
            '/api/tiles/v2/radar/200/512/{z}/{x}/{y}/2/1_1.png',
            expect.objectContaining({ maxNativeZoom: CONFIG.RADAR_MAX_TILE_ZOOM + 1, attribution: CONFIG.RADAR_ATTRIBUTION.librewxr })
        );
    });

    it('uses the capped zoom limit for Mapbox sources', async () => {
        const map = createMapboxMap();
        radar = new WeatherRadar(map);
        await radar.fetchAndFilter();
        radar.createLayers();
        radar.showFrame(0);

        expect(map._sources.get('radar-source-0')).toMatchObject({
            maxzoom: CONFIG.RADAR_MAX_TILE_ZOOM,
            attribution: CONFIG.RADAR_ATTRIBUTION.librewxr,
        });
    });

    it('rebuilds tile URLs when overlays change, keeping the playback position', async () => {
        radar = new WeatherRadar(createLeafletMap());
        await radar.fetchAndFilter();
        radar.createLayers();
        radar.currentFrame = 1;
        radar.pendingFrames = [{ time: 400, path: '/v2/radar/400', isForecast: false }];

        radar.setTileOptions({ arrows: true, lightning: true, colour: 6 });

        expect(radar.currentFrame).toBe(1);
        expect(radar.visibleLayerIndex).toBe(1);
        expect(radar.frames[1].url).toBe('/api/tiles/v2/radar/200/512/{z}/{x}/{y}/6/1_1.png?arrows=dark&lightning=dots');
        expect(radar.pendingFrames[0].url).toBe('/api/tiles/v2/radar/400/512/{z}/{x}/{y}/6/1_1.png?arrows=dark&lightning=dots');

        // Unchanged options do not rebuild
        const frames = radar.frames;
        radar.setTileOptions({ arrows: true });
        expect(radar.frames).toBe(frames);
    });

    it('only updates stored options when there are no frames yet', () => {
        radar = new WeatherRadar(createLeafletMap());
        radar.setTileOptions({ cells: true });
        expect(radar.tileOptions.cells).toBe(true);
        expect(radar.frames).toEqual([]);
    });

    it('switches overlay ink with the theme', async () => {
        const map = createMapboxMap();
        radar = new WeatherRadar(map);
        await radar.fetchAndFilter();
        radar.createLayers();
        radar.setTileOptions({ cells: true });
        expect(radar.frames[0].url).toContain('cells=dark');

        document.documentElement.setAttribute('data-theme', 'dark');
        radar.updateTheme();
        expect(radar.frames[0].url).toContain('cells=light');
    });

    it('re-adds Mapbox layers on theme change without overlays', async () => {
        const map = createMapboxMap();
        radar = new WeatherRadar(map);
        await radar.fetchAndFilter();
        radar.createLayers();
        radar.showFrame(2);
        const urls = radar.frames.map(f => f.url);

        map._layers.clear();
        map._sources.clear();
        radar.updateTheme();

        expect(radar.frames.map(f => f.url)).toEqual(urls);
        expect(map._layers.has('radar-layer-2')).toBe(true);
    });

    it('marks "now" on the slider and colours the forecast part of the track', async () => {
        document.body.innerHTML = '<input id="radarSlider" type="range"><span id="radarNowMarker" hidden></span>';
        radar = new WeatherRadar(createLeafletMap());
        await radar.fetchAndFilter();
        radar.updateSlider();

        const marker = document.getElementById('radarNowMarker');
        expect(marker.hidden).toBe(false);
        // Latest observed frame is index 1 of 3 frames
        expect(marker.style.left).toMatch(/^calc\(6px \+ .*0\.5/);
        expect(document.getElementById('radarSlider').style.background).toContain('var(--color-forecast-track)');

        // No forecast frames: no marker, plain track
        radar.pastFrameCount = radar.frames.length;
        radar.updateSlider();
        expect(marker.hidden).toBe(true);
        document.body.innerHTML = '';
    });

    it('toggles the satellite layer beneath the radar', async () => {
        const map = createMapboxMap();
        radar = new WeatherRadar(map);
        await radar.fetchAndFilter();
        radar.createLayers();
        radar.showFrame(2);

        radar.setSatelliteEnabled(true);
        expect(map.addLayer).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'satellite-layer' }), 'radar-layer-2');

        radar.setSatelliteEnabled(false);
        expect(map._layers.has('satellite-layer')).toBe(false);
    });
});
