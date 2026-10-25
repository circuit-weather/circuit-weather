// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SatelliteLayer } from '../public/src/map/SatelliteLayer.js';
import { CONFIG } from '../public/src/config.js';

const FRAME = { time: 100, url: '/api/tiles/v2/satellite/100/512/{z}/{x}/{y}/0/0_0.png' };

function createMapboxMap(styleLayers = []) {
    const layers = new Set();
    const sources = new Set();
    return {
        addSource: vi.fn((id) => sources.add(id)),
        addLayer: vi.fn((layer) => layers.add(layer.id)),
        removeLayer: vi.fn((id) => layers.delete(id)),
        removeSource: vi.fn((id) => sources.delete(id)),
        getLayer: vi.fn((id) => (layers.has(id) || styleLayers.includes(id) ? { id } : undefined)),
        getSource: vi.fn((id) => (sources.has(id) ? { id } : undefined)),
        getStyle: vi.fn(() => ({ layers: styleLayers.map(id => ({ id })) })),
        _layers: layers,
    };
}

describe('SatelliteLayer (Mapbox)', () => {
    it('does nothing until enabled with a frame', () => {
        const map = createMapboxMap();
        const layer = new SatelliteLayer(map);
        layer.setFrame(FRAME);
        expect(map.addSource).not.toHaveBeenCalled();

        layer.setFrame(FRAME); // same frame is a no-op
        layer.setEnabled(true);
        expect(map.addSource).toHaveBeenCalledWith('satellite-source', expect.objectContaining({
            tiles: [FRAME.url],
            maxzoom: CONFIG.SATELLITE_MAX_ZOOM,
            attribution: CONFIG.RADAR_ATTRIBUTION.librewxr,
        }));
        expect(map._layers.has('satellite-layer')).toBe(true);

        layer.setEnabled(true); // no-op
        expect(map.addSource).toHaveBeenCalledTimes(1);
    });

    it('is inserted below the lowest radar layer', () => {
        const map = createMapboxMap(['background', 'radar-layer-3', 'radar-layer-4']);
        const layer = new SatelliteLayer(map);
        layer.setEnabled(true);
        layer.setFrame(FRAME);
        expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'satellite-layer' }), 'radar-layer-3');
    });

    it('falls back to the range circles or the top of the stack', () => {
        const withCircles = createMapboxMap(['range-circles-line']);
        const a = new SatelliteLayer(withCircles);
        a.setFrame(FRAME);
        a.setEnabled(true);
        expect(withCircles.addLayer).toHaveBeenLastCalledWith(expect.any(Object), 'range-circles-line');

        const bare = createMapboxMap();
        bare.getStyle = undefined;
        const b = new SatelliteLayer(bare);
        b.setFrame(FRAME);
        b.setEnabled(true);
        expect(bare.addLayer).toHaveBeenLastCalledWith(expect.any(Object), undefined);
    });

    it('replaces the layer for a new frame, re-adds on theme change and removes when disabled', () => {
        const map = createMapboxMap();
        const layer = new SatelliteLayer(map);
        layer.setEnabled(true);
        layer.setFrame(FRAME);
        layer.setFrame({ time: 200, url: '/next' });
        expect(map.removeLayer).toHaveBeenCalledWith('satellite-layer');
        expect(map.addSource).toHaveBeenLastCalledWith('satellite-source', expect.objectContaining({ tiles: ['/next'] }));

        // A style change wipes the layer; updateTheme must re-add it
        map._layers.clear();
        map.removeSource('satellite-source');
        layer.updateTheme();
        expect(map._layers.has('satellite-layer')).toBe(true);

        layer.setEnabled(false);
        expect(map._layers.has('satellite-layer')).toBe(false);
        layer.destroy();
        expect(map.removeLayer).toHaveBeenCalledTimes(2);
    });
});

describe('SatelliteLayer (Leaflet)', () => {
    let tileLayer;

    beforeEach(() => {
        tileLayer = { addTo: vi.fn() };
        globalThis.L = { tileLayer: vi.fn(() => tileLayer) };
    });

    it('adds a Leaflet tile layer beneath the radar and removes it again', () => {
        const map = { hasLayer: vi.fn(), removeLayer: vi.fn() };
        const layer = new SatelliteLayer(map);
        layer.setFrame(FRAME);
        layer.setEnabled(true);

        expect(L.tileLayer).toHaveBeenCalledWith(FRAME.url, expect.objectContaining({
            zIndex: 50,
            maxNativeZoom: CONFIG.SATELLITE_MAX_ZOOM + 1,
            opacity: CONFIG.satelliteOpacity,
        }));
        expect(tileLayer.addTo).toHaveBeenCalledWith(map);

        layer.updateTheme(); // Leaflet keeps its layers across theme changes
        expect(L.tileLayer).toHaveBeenCalledTimes(1);

        layer.setEnabled(false);
        expect(map.removeLayer).toHaveBeenCalledWith(tileLayer);
        layer.destroy();
        expect(map.removeLayer).toHaveBeenCalledTimes(1);
    });

    it('tolerates a missing map', () => {
        const layer = new SatelliteLayer(null);
        layer.setFrame(FRAME);
        layer.setEnabled(true);
        layer.destroy();
        expect(L.tileLayer).not.toHaveBeenCalled();
    });
});
