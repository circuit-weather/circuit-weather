import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn().mockReturnValue(true) },
    style: {},
    textContent: '',
    value: '',
});

vi.stubGlobal('document', {
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    activeElement: { tagName: 'BODY' },
    createElement: vi.fn(() => createMockElement('created')),
});
vi.stubGlobal('navigator', { language: 'en-NZ' });
vi.stubGlobal('window', { addEventListener: vi.fn() });
vi.stubGlobal('fetch', vi.fn());
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');

/**
 * Just enough of Mapbox GL for the radar: like the real thing, adding a
 * source or layer whose id is taken is skipped by WeatherRadar's
 * getSource/getLayer checks, so a reused id means two frames share a layer.
 */
function createMapboxMap() {
    const sources = new Map();
    const layers = new Map();
    return {
        sources,
        layers,
        // No hasLayer: WeatherRadar takes that to mean Mapbox
        getSource: (id) => sources.get(id),
        addSource: (id, spec) => sources.set(id, spec),
        removeSource: (id) => sources.delete(id),
        getLayer: (id) => layers.get(id),
        addLayer: (spec) => layers.set(spec.id, { ...spec, opacity: spec.paint['raster-opacity'] }),
        removeLayer: (id) => layers.delete(id),
        setPaintProperty: (id, _name, value) => { layers.get(id).opacity = value; },
        once: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
    };
}

const frame = (time) => ({ time, path: `/v2/radar/${time}`, url: `https://api.librewxr.net/v2/radar/${time}/{z}.png` });
const frames = (...times) => times.map(frame);

describe('WeatherRadar on Mapbox: each frame keeps its own layer', () => {
    let map;
    let radar;

    // The map layers drawn on screen (opacity above the 0.01 used to start loading)
    const shown = () => [...map.layers.values()].filter(layer => layer.opacity > 0.01);
    const showAll = () => radar.frames.forEach((_, i) => radar.showFrame(i));

    beforeEach(() => {
        map = createMapboxMap();
        radar = new WeatherRadar(map);
        radar.ui.slider = createMockElement('radarSlider');
        radar.ui.time = createMockElement('radarTime');
        radar.frames = frames(100, 200, 300, 400);
        radar.layers = [];
        radar.currentFrame = 0;
        showAll();
    });

    it('shows one frame at a time through a whole loop, wrap included', () => {
        for (let i = 0; i < radar.frames.length; i++) {
            radar.showFrame(i);
            expect(shown()).toHaveLength(1);
        }
        radar.showFrame(0);
        expect(shown()).toHaveLength(1);
    });

    it('still does once the radar moves on a frame (oldest dropped, newest added)', () => {
        // Every ~10 minutes RadarPolling hands over the next set of frames
        radar.applyFrameUpdate(frames(200, 300, 400, 500));
        showAll();

        const ids = radar.layers.map(layer => layer.id);
        expect(new Set(ids).size).toBe(radar.frames.length);

        for (let i = 0; i < radar.frames.length; i++) {
            radar.showFrame(i);
            const visible = shown();
            expect(visible).toHaveLength(1);
            // ...and it is that frame's own tiles
            expect(map.sources.get(visible[0].source).tiles).toEqual([radar.frames[i].url]);
        }
        radar.showFrame(0);
        expect(shown()).toHaveLength(1);
    });

    it('keeps them apart over several updates', () => {
        radar.applyFrameUpdate(frames(200, 300, 400, 500));
        showAll();
        radar.applyFrameUpdate(frames(300, 400, 500, 600, 700));
        showAll();

        expect(new Set(radar.layers.map(layer => layer.id)).size).toBe(5);
        expect(map.layers.size).toBe(5);
        radar.frames.forEach((f, i) => {
            radar.showFrame(i);
            expect(map.sources.get(shown()[0].source).tiles).toEqual([f.url]);
        });
    });
});
