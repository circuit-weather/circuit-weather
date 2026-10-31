// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TrackRain } from '../public/src/map/TrackRain.js';
import { SAMPLE_TILE_SIZE } from '../public/src/utils/rain.js';

const NOW = 1_800_000_000 * 1000;
const t = (minutes) => NOW / 1000 + minutes * 60;

// Metadata as RadarFrames.getFramesFromApi returns it
const metadata = (overrides = {}) => ({
    provider: 'librewxr',
    pastCount: 2,
    frames: [
        { time: t(-15), path: '/v2/radar/a', isForecast: false },
        { time: t(-5), path: '/v2/radar/b', isForecast: false },
        { time: t(10), path: '/v2/radar/c', isForecast: true },
        { time: t(20), path: '/v2/radar/d', isForecast: true },
    ],
    ...overrides,
});

/** Tiles where every pixel has the given reflectivity per frame path (null = no echo). */
function tilesWithDbz(byPath) {
    return vi.fn(async (url) => {
        const path = url.match(/\/v2\/radar\/(\w+)\//)[1];
        const dbz = byPath[path];
        const data = new Uint8ClampedArray(SAMPLE_TILE_SIZE * SAMPLE_TILE_SIZE * 4);
        if (dbz !== null && dbz !== undefined) {
            for (let i = 0; i < data.length; i += 4) {
                data[i] = dbz + 32;
                data[i + 3] = 255;
            }
        }
        return { width: SAMPLE_TILE_SIZE, data };
    });
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('TrackRain', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reads the latest observed frame and the nowcast at the circuit', async () => {
        const loadPixels = tilesWithDbz({ b: null, c: 5, d: 30 });
        const onChange = vi.fn();
        const rain = new TrackRain({ onChange, loadPixels, now: () => NOW });

        rain.setLocation(-37.85, 144.97);
        rain.setMetadata(metadata());
        await flush();

        expect(onChange).toHaveBeenLastCalledWith({ state: 'approaching', minutes: 20 });
        const urls = loadPixels.mock.calls.map(([url]) => url);
        expect(urls).toEqual([
            '/api/tiles/v2/radar/b/256/8/231/157/0/0_0.png',
            '/api/tiles/v2/radar/c/256/8/231/157/0/0_0.png?nowcast=1',
            '/api/tiles/v2/radar/d/256/8/231/157/0/0_0.png?nowcast=1',
        ]);
    });

    it('re-reads tiles only when the frames or circuit change', async () => {
        const loadPixels = tilesWithDbz({ b: 35, c: 35, d: 0 });
        const onChange = vi.fn();
        let now = NOW;
        const rain = new TrackRain({ onChange, loadPixels, now: () => now });
        rain.setLocation(-37.85, 144.97);
        rain.setMetadata(metadata());
        await flush();
        expect(onChange).toHaveBeenLastCalledWith({ state: 'raining-easing', minutes: 20 });

        // Next poll, same frames: the minutes count down without new requests
        now += 5 * 60 * 1000;
        rain.setMetadata(metadata());
        await flush();
        expect(loadPixels).toHaveBeenCalledTimes(3);
        expect(onChange).toHaveBeenLastCalledWith({ state: 'raining-easing', minutes: 15 });

        // Same circuit again is a no-op; a new one is read
        rain.setLocation(-37.85, 144.97);
        expect(loadPixels).toHaveBeenCalledTimes(3);
        rain.setLocation(51.5, -0.1);
        await flush();
        expect(loadPixels).toHaveBeenCalledTimes(6);
    });

    it('reports nothing without LibreWXR, a nowcast, observed frames or a circuit', async () => {
        const loadPixels = tilesWithDbz({});
        const onChange = vi.fn();
        const rain = new TrackRain({ onChange, loadPixels, now: () => NOW });

        rain.setMetadata(metadata());
        expect(onChange).toHaveBeenLastCalledWith(null);

        rain.setMetadata(metadata({ provider: 'rainviewer' }));
        rain.setLocation(10, 10);
        expect(onChange).toHaveBeenLastCalledWith(null);

        rain.setMetadata(metadata({ pastCount: 4 }));
        expect(onChange).toHaveBeenLastCalledWith(null);

        rain.setMetadata(metadata({ pastCount: 0 }));
        expect(onChange).toHaveBeenLastCalledWith(null);

        rain.setMetadata({});
        rain.setLocation(null, null);
        expect(onChange).toHaveBeenLastCalledWith(null);
        expect(loadPixels).not.toHaveBeenCalled();
    });

    it('hides the status when a tile fails to load', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const onChange = vi.fn();
        const rain = new TrackRain({ onChange, loadPixels: vi.fn().mockRejectedValue(new Error('offline')) });
        rain.setLocation(10, 10);
        rain.setMetadata(metadata());
        await flush();
        expect(onChange).toHaveBeenLastCalledWith(null);
        expect(console.error).toHaveBeenCalledWith('Failed to read radar at the track:', expect.any(Error));
    });

    it('drops reads superseded by a newer circuit, and stops after destroy', async () => {
        let resolveFirst;
        const tiles = tilesWithDbz({ b: 0, c: 0, d: 0 });
        const loadPixels = vi.fn()
            .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
            .mockImplementation(tiles);
        const onChange = vi.fn();
        const rain = new TrackRain({ onChange, loadPixels, now: () => NOW });

        rain.setMetadata(metadata());
        rain.setLocation(10, 10);
        rain.setLocation(20, 20);
        await flush();
        expect(onChange).toHaveBeenLastCalledWith({ state: 'dry' });
        const calls = onChange.mock.calls.length;

        resolveFirst(await tiles('/v2/radar/b/'));
        await flush();
        expect(onChange).toHaveBeenCalledTimes(calls);

        rain.destroy();
        rain.setLocation(30, 30);
        await flush();
        expect(onChange).toHaveBeenCalledTimes(calls);

        // A failure from a superseded read is ignored too
        const failingChange = vi.fn();
        const failing = new TrackRain({
            onChange: failingChange,
            loadPixels: vi.fn().mockRejectedValueOnce(new Error('late')).mockImplementation(tiles),
            now: () => NOW,
        });
        failing.setMetadata(metadata());
        failing.setLocation(10, 10);
        failing.setLocation(20, 20);
        await flush();
        expect(failingChange.mock.calls).toEqual([[null], [{ state: 'dry' }]]);
    });
});

describe('TrackRain.loadPixels', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function stubCanvas(Global) {
        const context = {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16) })),
        };
        const bitmap = { width: 2, height: 2, close: vi.fn() };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => 'blob' }));
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
        if (Global) vi.stubGlobal('OffscreenCanvas', Global(context));
        return { context, bitmap };
    }

    it('decodes a tile through an OffscreenCanvas', async () => {
        const { context, bitmap } = stubCanvas((context) => class {
            constructor(width, height) { Object.assign(this, { width, height }); }
            getContext() { return context; }
        });
        const pixels = await TrackRain.loadPixels('/api/tiles/x.png');
        expect(fetch).toHaveBeenCalledWith('/api/tiles/x.png', expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
        expect(bitmap.close).toHaveBeenCalled();
        expect(pixels).toEqual({ width: 2, data: expect.any(Uint8ClampedArray) });
    });

    it('falls back to a DOM canvas', async () => {
        const { context } = stubCanvas(null);
        vi.stubGlobal('OffscreenCanvas', undefined);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
        const pixels = await TrackRain.loadPixels('/api/tiles/x.png');
        expect(pixels.width).toBe(2);
    });

    it('throws on HTTP errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
        await expect(TrackRain.loadPixels('/api/tiles/x.png')).rejects.toThrow('Radar tile error: 503');
    });
});
