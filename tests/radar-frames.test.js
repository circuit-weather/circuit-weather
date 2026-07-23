import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RadarFrames } from '../public/src/map/RadarFrames.js';
import { CONFIG } from '../public/src/config.js';

// Mock global fetch
const originalFetch = global.fetch;

describe('RadarFrames.getFramesFromApi', () => {
    beforeEach(() => {
        global.fetch = vi.fn();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('returns formatted frames and pastCount on successful fetch', async () => {
        const mockData = {
            radar: {
                past: [
                    { time: 100, path: '/past1' },
                    { time: 200, path: '/past2' }
                ],
                nowcast: [
                    { time: 300, path: '/now1' }
                ]
            }
        };

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockData
        });

        const result = await RadarFrames.getFramesFromApi();

        expect(global.fetch).toHaveBeenCalledWith(CONFIG.rainViewerApi, expect.objectContaining({
            signal: expect.any(AbortSignal)
        }));

        expect(result.pastCount).toBe(2);
        expect(result.frames).toHaveLength(3);

        expect(result.frames[0]).toEqual({
            time: 100,
            path: '/past1',
            url: '/api/tiles/past1/512/{z}/{x}/{y}/2/1_1.png'
        });

        expect(result.frames[2]).toEqual({
            time: 300,
            path: '/now1',
            url: '/api/tiles/now1/512/{z}/{x}/{y}/2/1_1.png'
        });
    });

    it('returns empty frames when API responds with an error status (e.g. 500)', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: false,
            status: 500
        });

        const result = await RadarFrames.getFramesFromApi();

        expect(result).toEqual({ frames: [], pastCount: 0 });
        expect(console.error).toHaveBeenCalledWith('RainViewer API error: 500');
    });

    it('returns empty frames when fetch throws an error (network error)', async () => {
        const networkError = new Error('Network failure');
        global.fetch.mockRejectedValueOnce(networkError);

        const result = await RadarFrames.getFramesFromApi();

        expect(result).toEqual({ frames: [], pastCount: 0 });
        expect(console.error).toHaveBeenCalledWith('Failed to fetch radar frames:', networkError);
    });

    it('handles successful response with missing data structures gracefully', async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({})
        });

        const result = await RadarFrames.getFramesFromApi();

        expect(result).toEqual({ frames: [], pastCount: 0 });
    });
});
