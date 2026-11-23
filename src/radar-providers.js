/**
 * Radar provider helpers for the Worker.
 *
 * LibreWXR (https://librewxr.net) is the primary radar source: it serves the
 * RainViewer v2 format plus a 60-minute nowcast, satellite imagery, storm
 * overlays, weather alerts and tiles up to zoom 12. RainViewer stays as a
 * fallback for when LibreWXR is unavailable.
 *
 * These functions are pure (no fetch/cache) so they can be unit tested on
 * their own. All upstream data is treated as untrusted and re-built into a
 * minimal, validated shape before it reaches the client.
 */

export const LIBREWXR_HOST = 'https://api.librewxr.net';
export const LIBREWXR_METADATA_URL = `${LIBREWXR_HOST}/public/weather-maps.json`;
export const LIBREWXR_ALERTS_URL = `${LIBREWXR_HOST}/v2/alerts`;
export const RAINVIEWER_METADATA_URL = 'https://api.rainviewer.com/public/weather-maps.json';

// RainViewer frame paths are prefixed so the client knows which host serves their
// tiles (tileBase in public/src/map/RadarFrames.js). LibreWXR paths are unchanged.
export const RAINVIEWER_PATH_PREFIX = '/rainviewer';

export const PROVIDER_MAX_ZOOM = Object.freeze({
  librewxr: 12,
  // RainViewer free tier limit (Jan 2026)
  rainviewer: 7,
});

const MAX_FRAMES = 48;
const MAX_COLOUR_SCHEMES = 32;
const MAX_ALERTS = 50;
const MAX_ALERT_TEXT = 2000;
const MAX_ALERT_TITLE = 200;
const MAX_ALERT_REGIONS = 500;
const MAX_ALERT_POINTS = 20000;

// Alerts are requested for a box around the circuit so nearby warnings show too.
export const ALERT_BBOX_HALF_SIZE_DEG = 2;

const LIBREWXR_FRAME_PATH = /^\/v2\/(radar|satellite)\/\d{1,12}$/;
const RAINVIEWER_FRAME_PATH = /^\/v2\/radar\/[A-Za-z0-9]{1,64}$/;

// LibreWXR colour scheme IDs (0-14) plus 255 (raw greyscale).
const VALID_COLOUR_IDS = new Set([...Array(15).keys(), 255]);

function sanitiseFrames(list, pathPattern, pathPrefix = '') {
  if (!Array.isArray(list)) return [];
  const frames = [];
  for (const frame of list) {
    if (frames.length >= MAX_FRAMES) break;
    if (!frame || !Number.isSafeInteger(frame.time) || frame.time <= 0) continue;
    if (typeof frame.path !== 'string' || !pathPattern.test(frame.path)) continue;
    frames.push({ time: frame.time, path: `${pathPrefix}${frame.path}` });
  }
  return frames;
}

function sanitiseColourSchemes(list) {
  if (!Array.isArray(list)) return [];
  const schemes = [];
  for (const scheme of list) {
    if (schemes.length >= MAX_COLOUR_SCHEMES) break;
    if (!scheme || !VALID_COLOUR_IDS.has(scheme.id) || typeof scheme.name !== 'string') continue;
    const name = scheme.name.trim().slice(0, 60);
    if (name) schemes.push({ id: scheme.id, name });
  }
  return schemes;
}

/**
 * Rebuild LibreWXR metadata into the client schema.
 * Returns null when there are no usable past frames.
 */
export function normaliseLibreWxrMetadata(data) {
  const past = sanitiseFrames(data?.radar?.past, LIBREWXR_FRAME_PATH);
  if (past.length === 0) return null;
  return {
    version: '2.0',
    provider: 'librewxr',
    maxZoom: PROVIDER_MAX_ZOOM.librewxr,
    radar: {
      past,
      nowcast: sanitiseFrames(data?.radar?.nowcast, LIBREWXR_FRAME_PATH),
    },
    satellite: {
      infrared: sanitiseFrames(data?.satellite?.infrared, LIBREWXR_FRAME_PATH),
    },
    colorSchemes: sanitiseColourSchemes(data?.radar?.colorSchemes),
  };
}

/**
 * Rebuild RainViewer metadata into the client schema, prefixing frame paths
 * so the client loads their tiles from RainViewer.
 * Returns null when there are no usable past frames.
 */
export function normaliseRainViewerMetadata(data) {
  const past = sanitiseFrames(data?.radar?.past, RAINVIEWER_FRAME_PATH, RAINVIEWER_PATH_PREFIX);
  if (past.length === 0) return null;
  return {
    version: '2.0',
    provider: 'rainviewer',
    maxZoom: PROVIDER_MAX_ZOOM.rainviewer,
    radar: {
      past,
      nowcast: sanitiseFrames(data?.radar?.nowcast, RAINVIEWER_FRAME_PATH, RAINVIEWER_PATH_PREFIX),
    },
    satellite: { infrared: [] },
    colorSchemes: [],
  };
}

function parseCoordinate(value, limit) {
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > limit) return null;
  return number;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Builds the upstream alerts URL for a circuit location.
 * Coordinates are rounded to 0.1° so every visitor to a circuit shares one
 * cache entry. Returns null if lat/lon are missing or out of range.
 */
export function buildAlertsUpstreamUrl(searchParams) {
  const lat = parseCoordinate(searchParams.get('lat'), 90);
  const lon = parseCoordinate(searchParams.get('lon'), 180);
  if (lat === null || lon === null) return null;

  const half = ALERT_BBOX_HALF_SIZE_DEG;
  const west = round1(clamp(lon - half, -180, 180));
  const east = round1(clamp(lon + half, -180, 180));
  const south = round1(clamp(lat - half, -85, 85));
  const north = round1(clamp(lat + half, -85, 85));
  return `${LIBREWXR_ALERTS_URL}?bbox=${west},${south},${east},${north}&simplify=1000`;
}

function isPosition(value) {
  return Array.isArray(value) && value.length >= 2 &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

// Rebuilds a polygon's rings with only [lon, lat] numbers, counting points
// against the shared budget. Returns null if any ring is malformed.
function sanitisePolygon(rings, budget) {
  if (!Array.isArray(rings) || rings.length === 0) return null;
  const clean = [];
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    budget.points += ring.length;
    if (budget.points > MAX_ALERT_POINTS) return null;
    const cleanRing = [];
    for (const position of ring) {
      if (!isPosition(position)) return null;
      cleanRing.push([position[0], position[1]]);
    }
    clean.push(cleanRing);
  }
  return clean;
}

function sanitiseGeometry(geometry, budget) {
  if (geometry?.type === 'Polygon') {
    const coordinates = sanitisePolygon(geometry.coordinates, budget);
    return coordinates ? { type: 'Polygon', coordinates } : null;
  }
  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length) {
    const coordinates = [];
    for (const polygon of geometry.coordinates) {
      const clean = sanitisePolygon(polygon, budget);
      if (!clean) return null;
      coordinates.push(clean);
    }
    return { type: 'MultiPolygon', coordinates };
  }
  return null;
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

const SEVERITIES = new Set(['extreme', 'severe', 'moderate', 'minor']);

function cleanSeverity(value) {
  const severity = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SEVERITIES.has(severity) ? severity : 'unknown';
}

const ALLOWED_URI_PROTOCOLS = new Set(['https:', 'http:']);

function cleanUri(value) {
  if (typeof value !== 'string' || value.length > 500) return '';
  try {
    const uri = new URL(value);
    return ALLOWED_URI_PROTOCOLS.has(uri.protocol) ? uri.href : '';
  } catch {
    return '';
  }
}

// LibreWXR sends alert times as Unix seconds (often as strings); ISO strings
// are accepted too in case other instances differ.
function cleanTime(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  let ms;
  if (/^\d{1,12}$/.test(text)) {
    ms = Number(text) * 1000;
  } else {
    ms = Date.parse(text);
  }
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Regions arrive either semicolon-joined or as a JSON array string ('[]' when none).
function cleanRegions(value) {
  const text = cleanText(value, MAX_ALERT_REGIONS * 2);
  if (!text.startsWith('[')) return text.slice(0, MAX_ALERT_REGIONS);
  try {
    // Valid JSON starting with '[' is always an array
    return JSON.parse(text)
      .filter((item) => typeof item === 'string')
      .join('; ')
      .slice(0, MAX_ALERT_REGIONS);
  } catch {
    return '';
  }
}

/**
 * Rebuilds an upstream alerts FeatureCollection with only validated
 * geometry and plain-text properties. Expired alerts are dropped.
 */
export function sanitiseAlerts(data, nowMs) {
  const features = [];
  const budget = { points: 0 };
  const list = Array.isArray(data?.features) ? data.features : [];

  for (const feature of list) {
    if (features.length >= MAX_ALERTS) break;
    const geometry = sanitiseGeometry(feature?.geometry, budget);
    if (!geometry) continue;

    const props = feature.properties || {};
    const expires = cleanTime(props.expires);
    if (expires && new Date(expires).getTime() < nowMs) continue;

    const title = cleanText(props.title, MAX_ALERT_TITLE);
    if (!title) continue;

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: `alert-${features.length}`,
        title,
        severity: cleanSeverity(props.severity),
        time: cleanTime(props.time),
        expires,
        description: cleanText(props.description, MAX_ALERT_TEXT),
        regions: cleanRegions(props.regions),
        uri: cleanUri(props.uri),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
