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
