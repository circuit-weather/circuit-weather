import { pixelDbz, samplePlan, summariseTrackRain, SAMPLE_TILE_SIZE, SAMPLE_ZOOM } from '../utils/rain.js';

/**
 * "Is it raining at the track, and will it?" from LibreWXR's radar nowcast.
 *
 * Reads the latest observed radar frame and the nowcast frames at the circuit
 * (black-and-white tiles, which encode reflectivity) and reports a status.
 * RainViewer, the fallback provider, has no nowcast, so the status is null then.
 */
export class TrackRain {
    /**
     * @param {Object} [options]
     * @param {Function} [options.onChange] - Called with the status (see summariseTrackRain) or null
     * @param {Function} [options.loadPixels] - (url) => Promise<{width, data}> RGBA pixels; for tests
     * @param {Function} [options.now] - () => ms; for tests
     */
    constructor(options = {}) {
        this.onChange = options.onChange || (() => {});
        this.loadPixels = options.loadPixels || TrackRain.loadPixels;
        this.now = options.now || (() => Date.now());
        this.location = null;
        this.metadata = null;
        this.readings = null;
        this.readingsKey = null;
        this.requestId = 0;
    }

    /**
     * @param {number|null} lat
     * @param {number|null} lon - Pass nulls to clear
     */
    setLocation(lat, lon) {
        const location = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
        if (location && this.location && this.location.lat === lat && this.location.lon === lon) return;
        this.location = location;
        this.update();
    }

    /**
     * Radar metadata from WeatherRadar (every poll). Tiles are only re-read
     * when the frames change; the status text is refreshed every time so the
     * minutes count down.
     * @param {{frames: Array, pastCount: number, provider: string|null}} metadata
     */
    setMetadata(metadata) {
        this.metadata = metadata;
        this.update();
    }

    async update() {
        const frames = this.framesToRead();
        if (!frames) {
            this.requestId++;
            this.readings = null;
            this.readingsKey = null;
            this.onChange(null);
            return;
        }

        const { lat, lon } = this.location;
        const key = `${lat},${lon}|${frames.map(frame => frame.path).join(',')}`;
        if (key === this.readingsKey) {
            this.emit();
            return;
        }

        const requestId = ++this.requestId;
        const plan = samplePlan(lat, lon);
        let readings;
        try {
            readings = await Promise.all(frames.map(async frame => ({
                time: frame.time,
                dbz: await this.readFrame(frame, plan),
            })));
        } catch (error) {
            if (requestId !== this.requestId) return;
            console.error('Failed to read radar at the track:', error);
            this.readings = null;
            this.readingsKey = null;
            this.onChange(null);
            return;
        }
        if (requestId !== this.requestId) return;

        this.readings = readings;
        this.readingsKey = key;
        this.emit();
    }

    emit() {
        const [observed, ...nowcast] = this.readings;
        this.onChange(summariseTrackRain(observed, nowcast, this.now()));
    }

    /** The latest observed frame plus the nowcast, or null when there is nothing to read. */
    framesToRead() {
        const { frames, pastCount, provider } = this.metadata || {};
        if (!this.location || provider !== 'librewxr' || !Array.isArray(frames)) return null;
        const observed = frames[pastCount - 1];
        const nowcast = frames.slice(pastCount);
        if (!observed || nowcast.length === 0) return null;
        return [observed, ...nowcast];
    }

    /** Strongest reflectivity (dBZ) at the track in one frame. */
    async readFrame(frame, plan) {
        // Nowcast tiles get a distinct URL for the cache, as in RadarFrames.buildTileUrl
        const query = frame.isForecast ? '?nowcast=1' : '';
        let strongest = -Infinity;
        for (const tile of plan) {
            const url = `/api/tiles${frame.path}/${SAMPLE_TILE_SIZE}/${SAMPLE_ZOOM}/${tile.x}/${tile.y}/0/0_0.png${query}`;
            const { width, data } = await this.loadPixels(url);
            for (const [px, py] of tile.pixels) {
                const i = (py * width + px) * 4;
                strongest = Math.max(strongest, pixelDbz(data[i], data[i + 3]));
            }
        }
        return strongest;
    }

    destroy() {
        this.requestId++;
        this.onChange = () => {};
    }

    /**
     * Fetches a tile and returns its RGBA pixels. Tiles come from our own
     * worker, so reading them back from a canvas is allowed.
     */
    static async loadPixels(url) {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`Radar tile error: ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = typeof OffscreenCanvas === 'function'
            ? new OffscreenCanvas(bitmap.width, bitmap.height)
            : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        return { width: canvas.width, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    }
}
