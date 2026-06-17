import { CONFIG } from '../config.js';

export class RadarFrames {
    /**
     * Fetches radar frames from the API.
     * @returns {Promise<{ frames: Array, pastCount: number }>}
     */
    static async getFramesFromApi() {
        try {
            const response = await fetch(CONFIG.rainViewerApi, {
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) {
                console.error(`RainViewer API error: ${response.status}`);
                return { frames: [], pastCount: 0 };
            }
            const data = await response.json();

            const past = data.radar?.past || [];
            const nowcast = data.radar?.nowcast || [];

            // Store the count of past frames to identify the forecast start
            const pastCount = past.length;

            const frames = [...past, ...nowcast].map(frame => ({
                time: frame.time,
                path: frame.path,
                url: `/api/tiles${frame.path}/512/{z}/{x}/{y}/2/1_1.png`,
            }));

            return { frames, pastCount };
        } catch (error) {
            console.error('Failed to fetch radar frames:', error);
            return { frames: [], pastCount: 0 };
        }
    }
}
