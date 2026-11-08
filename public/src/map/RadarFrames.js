import { CONFIG } from '../config.js';

const PROVIDERS = new Set(['librewxr', 'rainviewer']);
// The Worker prefixes RainViewer frame paths with this (see src/radar-providers.js)
const RAINVIEWER_PATH_PREFIX = '/rainviewer/';

/**
 * Where a frame's tiles are served from. Frame paths come from /api/radar, which
 * only passes paths matching the providers' formats, so they are safe to append.
 *
 * @param {string} path - e.g. /v2/radar/123 or /rainviewer/v2/radar/abc
 * @returns {string} The frame's tile URL prefix on the provider's host
 */
export function tileBase(path) {
    if (path.startsWith(RAINVIEWER_PATH_PREFIX)) {
        return `${CONFIG.RAINVIEWER_TILE_HOST}${path.slice(RAINVIEWER_PATH_PREFIX.length - 1)}`;
    }
    return `${CONFIG.LIBREWXR_TILE_HOST}${path}`;
}

export class RadarFrames {
    /**
     * Fetches radar frames from the API.
     *
     * The worker serves LibreWXR metadata, or RainViewer's as a fallback. Only
     * LibreWXR supports colour schemes, storm overlays and satellite imagery.
     *
     * @param {Object} [options] - Tile options, see buildTileUrl()
     * @returns {Promise<{ frames: Array, pastCount: number, provider: string|null,
     *   maxZoom: number, satellite: Object|null, colorSchemes: Array }>}
     */
    static async getFramesFromApi(options = {}) {
        try {
            const response = await fetch(CONFIG.rainViewerApi, {
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) {
                console.error(`Radar API error: ${response.status}`);
                return RadarFrames.emptyResult();
            }
            const data = await response.json();

            const provider = PROVIDERS.has(data.provider) ? data.provider : null;
            const past = data.radar?.past || [];
            const nowcast = data.radar?.nowcast || [];

            // Store the count of past frames to identify the forecast start
            const pastCount = past.length;

            const frames = [
                ...past.map(frame => ({ ...frame, isForecast: false })),
                ...nowcast.map(frame => ({ ...frame, isForecast: true }))
            ].map(frame => ({
                time: frame.time,
                path: frame.path,
                isForecast: frame.isForecast,
                url: RadarFrames.buildTileUrl(frame, provider, options),
            }));

            const infrared = Array.isArray(data.satellite?.infrared) ? data.satellite.infrared : [];
            const latestSatellite = infrared.length ? infrared[infrared.length - 1] : null;

            return {
                frames,
                pastCount,
                provider,
                maxZoom: Number.isInteger(data.maxZoom) ? data.maxZoom : CONFIG.RADAR_FALLBACK_MAX_ZOOM,
                satellite: latestSatellite ? {
                    time: latestSatellite.time,
                    url: `${tileBase(latestSatellite.path)}/512/{z}/{x}/{y}/0/0_0.png`
                } : null,
                colorSchemes: Array.isArray(data.colorSchemes) ? data.colorSchemes : [],
            };
        } catch (error) {
            console.error('Failed to fetch radar frames:', error);
            return RadarFrames.emptyResult();
        }
    }

    static emptyResult() {
        return {
            frames: [],
            pastCount: 0,
            provider: null,
            maxZoom: CONFIG.RADAR_FALLBACK_MAX_ZOOM,
            satellite: null,
            colorSchemes: []
        };
    }

    /**
     * Builds the tile URL template for a radar frame.
     *
     * @param {{ path: string, isForecast?: boolean }} frame
     * @param {string|null} provider - 'librewxr' enables the options below
     * @param {Object} options
     * @param {number} [options.colour] - LibreWXR colour scheme ID
     * @param {boolean} [options.arrows] - Precipitation motion arrows
     * @param {boolean} [options.cells] - Storm cell markers
     * @param {boolean} [options.lightning] - Lightning strikes
     * @param {boolean} [options.darkMap] - Draw overlays in light ink for a dark basemap
     * @returns {string}
     */
    static buildTileUrl(frame, provider, options = {}) {
        if (provider !== 'librewxr') {
            return `${tileBase(frame.path)}/512/{z}/{x}/{y}/2/1_1.png`;
        }

        const colour = Number.isInteger(options.colour) ? options.colour : CONFIG.RADAR_DEFAULT_COLOUR;
        const ink = options.darkMap ? 'light' : 'dark';
        const params = [];
        if (options.arrows) params.push(`arrows=${ink}`);
        if (options.cells) params.push(`cells=${ink}`);
        if (options.lightning) params.push('lightning=dots');
        // Nowcast tiles are re-generated under the same timestamp and become
        // observed frames later, so give them a distinct URL for the browser cache.
        if (frame.isForecast) params.push('nowcast=1');

        const query = params.length ? `?${params.join('&')}` : '';
        return `${tileBase(frame.path)}/512/{z}/{x}/{y}/${colour}/1_1.png${query}`;
    }
}
