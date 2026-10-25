import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RadarFrames } from '../public/src/map/RadarFrames.js';
import { CONFIG } from '../public/src/config.js';

// Mock global fetch
const originalFetch = global.fetch;

const okJson = (data) => ({ ok: true, json: async () => data });

describe('RadarFrames.getFramesFromApi', () => {
    beforeEach(() => {
        global.fetch = vi.fn();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('returns LibreWXR frames, forecast flags, zoom, satellite and colour schemes', async () => {
        global.fetch.mockResolvedValueOnce(okJson({
            provider: 'librewxr',
            maxZoom: 12,
            radar: {
                past: [{ time: 100, path: '/v2/radar/100' }, { time: 200, path: '/v2/radar/200' }],
                nowcast: [{ time: 300, path: '/v2/radar/300' }]
            },
            satellite: { infrared: [{ time: 50, path: '/v2/satellite/50' }, { time: 90, path: '/v2/satellite/90' }] },
            colorSchemes: [{ id: 2, name: 'Universal Blue' }]
        }));

        const result = await RadarFrames.getFramesFromApi({ colour: 4 });

        expect(global.fetch).toHaveBeenCalledWith(CONFIG.rainViewerApi, expect.objectContaining({
            signal: expect.any(Object)
        }));
        expect(result.pastCount).toBe(2);
        expect(result.provider).toBe('librewxr');
        expect(result.maxZoom).toBe(12);
        expect(result.frames).toEqual([
            { time: 100, path: '/v2/radar/100', isForecast: false, url: '/api/tiles/v2/radar/100/512/{z}/{x}/{y}/4/1_1.png' },
            { time: 200, path: '/v2/radar/200', isForecast: false, url: '/api/tiles/v2/radar/200/512/{z}/{x}/{y}/4/1_1.png' },
            { time: 300, path: '/v2/radar/300', isForecast: true, url: '/api/tiles/v2/radar/300/512/{z}/{x}/{y}/4/1_1.png?nowcast=1' },
        ]);
        expect(result.satellite).toEqual({ time: 90, url: '/api/tiles/v2/satellite/90/512/{z}/{x}/{y}/0/0_0.png' });
        expect(result.colorSchemes).toEqual([{ id: 2, name: 'Universal Blue' }]);
    });

    it('uses plain RainViewer tile URLs for the fallback provider', async () => {
        global.fetch.mockResolvedValueOnce(okJson({
            provider: 'rainviewer',
            maxZoom: 7,
            radar: { past: [{ time: 100, path: '/rainviewer/v2/radar/abc' }] }
        }));

        const result = await RadarFrames.getFramesFromApi({ colour: 4, arrows: true });

        expect(result.provider).toBe('rainviewer');
        expect(result.maxZoom).toBe(7);
        expect(result.frames[0].url).toBe('/api/tiles/rainviewer/v2/radar/abc/512/{z}/{x}/{y}/2/1_1.png');
        expect(result.satellite).toBeNull();
        expect(result.colorSchemes).toEqual([]);
    });

    it('returns empty frames when API responds with an error status (e.g. 500)', async () => {
        global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

        const result = await RadarFrames.getFramesFromApi();

        expect(result).toEqual(RadarFrames.emptyResult());
        expect(console.error).toHaveBeenCalledWith('Radar API error: 500');
    });

    it('returns empty frames when fetch throws an error (network error)', async () => {
        const networkError = new Error('Network failure');
        global.fetch.mockRejectedValueOnce(networkError);

        const result = await RadarFrames.getFramesFromApi();

        expect(result).toEqual(RadarFrames.emptyResult());
        expect(console.error).toHaveBeenCalledWith('Failed to fetch radar frames:', networkError);
    });

    it('handles successful response with missing data structures gracefully', async () => {
        global.fetch.mockResolvedValueOnce(okJson({ provider: 'unknown' }));

        const result = await RadarFrames.getFramesFromApi();

        expect(result).toEqual({
            frames: [],
            pastCount: 0,
            provider: null,
            maxZoom: CONFIG.RADAR_FALLBACK_MAX_ZOOM,
            satellite: null,
            colorSchemes: []
        });
    });
});

describe('RadarFrames.buildTileUrl', () => {
    const frame = { path: '/v2/radar/100', isForecast: false };

    it('adds storm overlays in dark ink on light maps', () => {
        const url = RadarFrames.buildTileUrl(frame, 'librewxr', { colour: 6, arrows: true, cells: true, lightning: true });
        expect(url).toBe('/api/tiles/v2/radar/100/512/{z}/{x}/{y}/6/1_1.png?arrows=dark&cells=dark&lightning=dots');
    });

    it('adds storm overlays in light ink on dark maps', () => {
        const url = RadarFrames.buildTileUrl(frame, 'librewxr', { arrows: true, cells: true, darkMap: true });
        expect(url).toBe(`/api/tiles/v2/radar/100/512/{z}/{x}/{y}/${CONFIG.RADAR_DEFAULT_COLOUR}/1_1.png?arrows=light&cells=light`);
    });

    it('marks forecast frames and uses the default colour when none is given', () => {
        const url = RadarFrames.buildTileUrl({ path: '/v2/radar/900', isForecast: true }, 'librewxr');
        expect(url).toBe(`/api/tiles/v2/radar/900/512/{z}/{x}/{y}/${CONFIG.RADAR_DEFAULT_COLOUR}/1_1.png?nowcast=1`);
    });

    it('ignores LibreWXR options when the provider is unknown', () => {
        expect(RadarFrames.buildTileUrl(frame, null, { arrows: true })).toBe('/api/tiles/v2/radar/100/512/{z}/{x}/{y}/2/1_1.png');
    });
});
