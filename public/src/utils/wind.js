const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * Map a wind bearing (degrees, the direction wind is coming FROM) to a compass
 * label and the rotation for an up-pointing arrow to show where it blows TOWARD.
 * 0° (N) blows south, so the arrow rotates 180° to point down.
 */
export function getWindDirection(degrees) {
    const index = Math.round(degrees / 45) % 8;
    return {
        text: COMPASS_POINTS[index],
        rotation: degrees + 180
    };
}

/**
 * Convert a wind speed + meteorological bearing (the direction the wind comes
 * FROM, clockwise from north) into eastward (u) and northward (v) vector
 * components, in the same units as `speed`.
 */
export function windToVector(speed, direction) {
    const toward = (direction + 180) * Math.PI / 180;
    return {
        u: speed * Math.sin(toward),
        v: speed * Math.cos(toward),
    };
}

/**
 * Bilinearly interpolate the wind vector at (lat, lon) from a gridded field.
 * The field stores u/v as flat row-major arrays (lat ascending, lon ascending).
 * Coordinates outside the field bounds are clamped to the edge.
 */
export function sampleWindField(field, lat, lon) {
    const { minLat, maxLat, minLon, maxLon, rows, cols, u, v } = field;

    const clampedLat = Math.min(Math.max(lat, minLat), maxLat);
    const clampedLon = Math.min(Math.max(lon, minLon), maxLon);

    const fr = maxLat === minLat ? 0 : ((clampedLat - minLat) / (maxLat - minLat)) * (rows - 1);
    const fc = maxLon === minLon ? 0 : ((clampedLon - minLon) / (maxLon - minLon)) * (cols - 1);

    const r0 = Math.floor(fr);
    const c0 = Math.floor(fc);
    const r1 = Math.min(r0 + 1, rows - 1);
    const c1 = Math.min(c0 + 1, cols - 1);
    const tr = fr - r0;
    const tc = fc - c0;

    const idx = (r, c) => r * cols + c;
    const lerp = (a, b, t) => a + (b - a) * t;

    const uTop = lerp(u[idx(r0, c0)], u[idx(r0, c1)], tc);
    const uBot = lerp(u[idx(r1, c0)], u[idx(r1, c1)], tc);
    const vTop = lerp(v[idx(r0, c0)], v[idx(r0, c1)], tc);
    const vBot = lerp(v[idx(r1, c0)], v[idx(r1, c1)], tc);

    return { u: lerp(uTop, uBot, tr), v: lerp(vTop, vBot, tr) };
}
