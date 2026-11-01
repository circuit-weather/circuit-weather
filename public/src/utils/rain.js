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

// The rain banner covers a session from this long before it starts until it
// ends: a race weekend from Friday on, and never a forecast days too early to trust
export const RAIN_BANNER_LEAD_HOURS = 72;

/**
 * Whether a session is close enough (or under way) for its rain verdict to be worth a banner.
 * @param {Date} sessionTime
 * @param {string} sessionId
 * @param {number} nowMs
 */
export function isRainBannerTimely(sessionTime, sessionId, nowMs) {
    const start = sessionTime instanceof Date ? sessionTime.getTime() : NaN;
    if (!Number.isFinite(start)) return false;
    const end = start + sessionHours(sessionId) * 3600000;
    return nowMs >= start - RAIN_BANNER_LEAD_HOURS * 3600000 && nowMs < end;
}

// The radar nowcast looks an hour ahead, so it only speaks for a session
// that is under way or starts within that hour
export const NOWCAST_LEAD_MINUTES = 60;

/**
 * Whether the radar nowcast at the track bears on a session.
 * @param {Date} sessionTime
 * @param {string} sessionId
 * @param {number} nowMs
 */
export function isNowcastRelevant(sessionTime, sessionId, nowMs) {
    const start = sessionTime instanceof Date ? sessionTime.getTime() : NaN;
    if (!Number.isFinite(start)) return false;
    const end = start + sessionHours(sessionId) * 3600000;
    return nowMs >= start - NOWCAST_LEAD_MINUTES * 60000 && nowMs < end;
}

/**
 * Summarises the chance of rain during a session.
 *
 * @param {Array<{time: number, precipProb: number}>} hourly - Unix seconds; precipProb
 *   is the chance of rain in the hour starting at time
 * @param {Date} sessionTime - Session start
 * @param {number} hours - Session length
 * @param {number} [nowMs] - Hours already over by now are left out
 * @returns {{level: 'dry'|'possible'|'likely', peakPct: number, peakTime: number}|null}
 *   peakTime (Unix seconds) is when to say the peak is: the middle of the
 *   wettest hour, or the next 5 minutes if that is already past; null without data
 */
export function getSessionRainVerdict(hourly, sessionTime, hours, nowMs = 0) {
    if (!Array.isArray(hourly) || !(sessionTime instanceof Date)) return null;

    // Each value is the chance of rain in the hour starting at h.time (see
    // WeatherClient.filterHourly), so take the hours that overlap the session,
    // from the one it starts in. Once it is under way, hours already over are
    // dropped: the verdict is about what's still to come.
    const start = Math.floor(sessionTime.getTime() / 3600000) * 3600;
    const end = sessionTime.getTime() / 1000 + hours * 3600;
    const during = hourly.filter(h => h.time >= start && h.time < end
        && (h.time + 3600) * 1000 > nowMs && Number.isFinite(h.precipProb));
    if (during.length === 0) return null;

    const peak = during.reduce((max, h) => (h.precipProb > max.precipProb ? h : max));
    // Band the rounded value so the wording matches the percentage shown
    const peakPct = Math.round(peak.precipProb);
    let level = 'dry';
    if (peakPct >= RAIN_LIKELY_PCT) level = 'likely';
    else if (peakPct >= RAIN_POSSIBLE_PCT) level = 'possible';

    // "Around" the middle of the peak hour, but never a time already past: in
    // the hour under way, the next 5 minutes
    const middle = (peak.time + 1800) * 1000;
    const soonest = Math.ceil(nowMs / 300000) * 300000;
    return { level, peakPct, peakTime: Math.max(middle, soonest) / 1000 };
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
