/**
 * Rain answers for the selected circuit: a verdict for the session from the
 * hourly forecast, and "rain at the track" from the radar nowcast.
 */

// Open-Meteo precipitation probability (%) bands for the session verdict
export const RAIN_POSSIBLE_PCT = 20;
export const RAIN_LIKELY_PCT = 50;

// Radar reflectivity (dBZ) counted as rain at the track: ~0.6 mm/h, where a
// track starts to get damp. Weaker echoes are mostly drizzle or clutter.
export const RAIN_DBZ = 20;

// Radar pixels within this distance of the circuit centre count as "at the track"
export const TRACK_RADIUS_KM = 3;

// Radar data is ~1 km resolution: zoom 8 (~600 m pixels) is ample
export const SAMPLE_ZOOM = 8;
export const SAMPLE_TILE_SIZE = 256;

/**
 * Hours of a session the verdict covers. Races run up to two hours; other
 * sessions about one. The forecast window ends 3 hours after the start anyway.
 * @param {string} [sessionId]
 */
export function sessionHours(sessionId) {
    return typeof sessionId === 'string' && sessionId.includes('race') ? 2 : 1;
}

/**
 * Summarises the chance of rain during a session.
 *
 * @param {Array<{time: number, precipProb: number}>} hourly - Unix seconds
 * @param {Date} sessionTime - Session start
 * @param {number} hours - Session length
 * @returns {{level: 'dry'|'possible'|'likely', peakPct: number, peakTime: number}|null}
 *   peakTime is the (Unix seconds) hour with the highest chance; null without data
 */
export function getSessionRainVerdict(hourly, sessionTime, hours) {
    if (!Array.isArray(hourly) || !(sessionTime instanceof Date)) return null;

    // Hourly values cover the hour they start, so include the hour the session starts in
    const start = Math.floor(sessionTime.getTime() / 3600000) * 3600;
    const end = sessionTime.getTime() / 1000 + hours * 3600;
    const during = hourly.filter(h => h.time >= start && h.time < end && Number.isFinite(h.precipProb));
    if (during.length === 0) return null;

    const peak = during.reduce((max, h) => (h.precipProb > max.precipProb ? h : max));
    // Band the rounded value so the wording matches the percentage shown
    const peakPct = Math.round(peak.precipProb);
    let level = 'dry';
    if (peakPct >= RAIN_LIKELY_PCT) level = 'likely';
    else if (peakPct >= RAIN_POSSIBLE_PCT) level = 'possible';

    return { level, peakPct, peakTime: peak.time };
}

/**
 * Turns radar readings at the track into a status.
 *
 * @param {{time: number, dbz: number}} observed - Latest observed frame
 * @param {Array<{time: number, dbz: number}>} nowcast - Forecast frames, oldest first
 * @param {number} nowMs
 * @returns {{state: 'raining'|'raining-easing'|'approaching'|'dry', minutes?: number}}
 */
export function summariseTrackRain(observed, nowcast, nowMs) {
    const isRain = frame => frame.dbz >= RAIN_DBZ;
    const minutesUntil = frame => Math.max(5, Math.round((frame.time * 1000 - nowMs) / 300000) * 5);
    const upcoming = nowcast.filter(frame => frame.time * 1000 > nowMs);

    if (isRain(observed)) {
        const easing = upcoming.find(frame => !isRain(frame));
        return easing ? { state: 'raining-easing', minutes: minutesUntil(easing) } : { state: 'raining' };
    }
    const arriving = upcoming.find(isRain);
    return arriving ? { state: 'approaching', minutes: minutesUntil(arriving) } : { state: 'dry' };
}

/**
 * Reflectivity of a pixel from a radar tile in colour scheme 0 (black and
 * white): red = dBZ + 32 (the top bit flags snow); transparent means no echo.
 * @returns {number} dBZ, or -Infinity for no echo
 */
export function pixelDbz(red, alpha) {
    if (alpha === 0) return -Infinity;
    return (red & 127) - 32;
}

/**
 * Web Mercator position of a point in world pixels at a zoom level.
 */
export function worldPixel(lat, lon, zoom, tileSize = SAMPLE_TILE_SIZE) {
    const scale = tileSize * 2 ** zoom;
    const sin = Math.sin(lat * Math.PI / 180);
    return {
        x: (lon + 180) / 360 * scale,
        y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
}

/**
 * The tiles and pixels within `radiusKm` of a point.
 * @returns {Array<{x: number, y: number, pixels: Array<[number, number]>}>}
 *   Tile coordinates, each with the in-tile [px, py] pixels to read
 */
export function samplePlan(lat, lon, radiusKm = TRACK_RADIUS_KM, zoom = SAMPLE_ZOOM, tileSize = SAMPLE_TILE_SIZE) {
    const centre = worldPixel(lat, lon, zoom, tileSize);
    const metresPerPixel = 40075016.686 * Math.cos(lat * Math.PI / 180) / (tileSize * 2 ** zoom);
    const radius = Math.max(1, (radiusKm * 1000) / metresPerPixel);
    const tilesAcross = 2 ** zoom;

    const tiles = new Map();
    for (let wy = Math.floor(centre.y - radius); wy <= Math.ceil(centre.y + radius); wy++) {
        for (let wx = Math.floor(centre.x - radius); wx <= Math.ceil(centre.x + radius); wx++) {
            if ((wx + 0.5 - centre.x) ** 2 + (wy + 0.5 - centre.y) ** 2 > radius ** 2) continue;
            const ty = Math.floor(wy / tileSize);
            if (ty < 0 || ty >= tilesAcross) continue;
            // Wrap across the antimeridian
            const tx = ((Math.floor(wx / tileSize) % tilesAcross) + tilesAcross) % tilesAcross;
            const key = `${tx}/${ty}`;
            if (!tiles.has(key)) tiles.set(key, { x: tx, y: ty, pixels: [] });
            const px = ((wx % tileSize) + tileSize) % tileSize;
            tiles.get(key).pixels.push([px, wy - ty * tileSize]);
        }
    }
    return [...tiles.values()];
}
