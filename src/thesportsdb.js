/**
 * TheSportsDB client for non-F1 series schedules (see src/handlers/schedule.js).
 *
 * The API key comes from the THESPORTSDB_API_KEY secret so it can be swapped for a
 * premium key without a code change. Without the secret we fall back to the public
 * free key ("123"), which TheSportsDB publishes in its own documentation.
 *
 * The free tier allows 30 requests per minute, so every upstream call goes through
 * UpstreamThrottle, and a 429 pauses all calls (in this isolate and, via the cache,
 * the whole data centre) until the limit window has passed.
 */

const API_BASE = 'https://www.thesportsdb.com/api/v1/json';
export const FREE_API_KEY = '123';
// SEC: The key is interpolated into the upstream path, so only plain tokens are accepted
const API_KEY_REGEX = /^[A-Za-z0-9]{1,64}$/;
const TIMEOUT_MS = 5000;

// Supported series → TheSportsDB league. F1 stays on Jolpica (src/handlers/f1.js).
// f1Layouts: the series races the F1 layout of shared venues, so the F1 track outline
// applies. Formula E runs shortened or different layouts (e.g. Monaco, Mexico City).
// WEC uses the full F1 layouts at the venues it shares (Spa, Interlagos, Monza, ...).
export const SERIES = Object.freeze({
  f2: Object.freeze({ leagueId: '4486', f1Layouts: true }),
  f3: Object.freeze({ leagueId: '4487', f1Layouts: true }),
  fe: Object.freeze({ leagueId: '4371', f1Layouts: false }),
  wec: Object.freeze({ leagueId: '4413', f1Layouts: true }),
});

// Free tier: 30 requests/minute. Leave headroom for other isolates and data centres
// sharing the key; a 429 is still handled if they push it over.
export const UPSTREAM_LIMIT_PER_MINUTE = 20;
// How long to stop calling upstream after a 429. TheSportsDB says to wait a minute.
export const RATE_LIMIT_COOLDOWN_MS = 60000;

// Maps TheSportsDB venue IDs (taken from the 2026 F1 calendar, plus WEC's other F1
// venues) → Ergast circuitId, so
// the client can load the track GeoJSON overlay (CIRCUIT_MAP in public/src/config.js).
// Venues not listed here are centred on the venue's coordinates without an outline.
export const VENUE_CIRCUIT_MAP = Object.freeze({
  '27574': 'albert_park',
  '15419': 'shanghai',
  '15628': 'suzuka',
  '23723': 'miami',
  '15421': 'villeneuve',
  '15413': 'monaco',
  '15462': 'catalunya',
  '15422': 'red_bull_ring',
  '15423': 'silverstone',
  '15426': 'spa',
  '15425': 'hungaroring',
  '15891': 'zandvoort',
  '27575': 'monza',
  '15627': 'baku',
  '15417': 'sepang',
  '15428': 'marina_bay',
  '15431': 'americas',
  '15434': 'rodriguez',
  '27577': 'interlagos',
  '30800': 'las_vegas',
  '27576': 'losail',
  '15433': 'yas_marina',
  '23722': 'jeddah',
  '15418': 'bahrain',
  '23648': 'imola',
});

/**
 * Returns the API key to use, falling back to the free key when the secret is
 * missing or malformed.
 */
export function getApiKey(env) {
  const key = env?.THESPORTSDB_API_KEY;
  return typeof key === 'string' && API_KEY_REGEX.test(key) ? key : FREE_API_KEY;
}

/**
 * Sliding-window limiter for calls to TheSportsDB from this isolate, plus a
 * cooldown that blocks every call after an upstream 429.
 */
export class UpstreamThrottle {
  constructor(limit = UPSTREAM_LIMIT_PER_MINUTE, windowMs = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.calls = [];
    this.cooldownUntil = 0;
  }

  tryAcquire(now = Date.now()) {
    if (now < this.cooldownUntil) return false;
    while (this.calls.length && now - this.calls[0] >= this.windowMs) this.calls.shift();
    if (this.calls.length >= this.limit) return false;
    this.calls.push(now);
    return true;
  }

  startCooldown(until) {
    this.cooldownUntil = Math.max(this.cooldownUntil, until);
  }

  isCoolingDown(now = Date.now()) {
    return now < this.cooldownUntil;
  }
}

/**
 * Calls a TheSportsDB v1 endpoint.
 * @returns {Promise<{ok: true, data: object} | {ok: false, limited: boolean, reason: string}>}
 *   limited is true when the call was refused by the throttle or by a 429, so the
 *   caller should stop making further calls for now. reason says why it failed
 *   ('throttled', 'rate_limited', 'http_<status>', 'invalid_response', 'network') and
 *   is safe to return to clients.
 */
export async function fetchTheSportsDb(path, env, throttle) {
  if (!throttle.tryAcquire()) return { ok: false, limited: true, reason: 'throttled' };
  let response;
  try {
    response = await fetch(`${API_BASE}/${getApiKey(env)}/${path}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CircuitWeather/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // SEC: Never log the request URL: it contains the API key
    if (env?.ENVIRONMENT !== 'production') console.error('TheSportsDB fetch failed:', error?.name);
    return { ok: false, limited: false, reason: 'network' };
  }
  if (response.status === 429) {
    throttle.startCooldown(Date.now() + RATE_LIMIT_COOLDOWN_MS);
    return { ok: false, limited: true, reason: 'rate_limited' };
  }
  if (!response.ok) return { ok: false, limited: false, reason: `http_${response.status}` };
  try {
    // TheSportsDB serves JSON with a text/html content type on some endpoints, so
    // parse the body rather than trusting the header. A bot challenge page fails here.
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, limited: false, reason: 'invalid_response' };
  }
}

/**
 * Parses a TheSportsDB venue strMap value into decimal coordinates.
 * Accepts degrees/minutes/seconds ("37°50′59″S 144°58′6″E", ASCII ' and " too)
 * and plain decimal pairs ("-37.85, 144.97").
 * @returns {{lat: number, long: number} | null}
 */
export function parseCoordinates(value) {
  if (typeof value !== 'string' || value.length > 200) return null;
  const text = value.trim();

  const decimal = text.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (decimal) return validCoordinates(Number(decimal[1]), Number(decimal[2]));

  const dms = /(\d{1,3}(?:\.\d+)?)\s*°\s*(?:(\d{1,2}(?:\.\d+)?)\s*[′'’]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:″|"|”|′′|'')\s*)?([NSEW])/gi;
  const parts = [...text.matchAll(dms)];
  if (parts.length !== 2) return null;

  let lat = null;
  let long = null;
  for (const [, deg, min = '0', sec = '0', hemi] of parts) {
    const h = hemi.toUpperCase();
    const abs = Number(deg) + Number(min) / 60 + Number(sec) / 3600;
    const signed = h === 'S' || h === 'W' ? -abs : abs;
    if (h === 'N' || h === 'S') lat = signed;
    else long = signed;
  }
  if (lat === null || long === null) return null;
  return validCoordinates(lat, long);
}

function validCoordinates(lat, long) {
  if (!Number.isFinite(lat) || !Number.isFinite(long)) return null;
  if (Math.abs(lat) > 90 || Math.abs(long) > 180) return null;
  return { lat: Math.round(lat * 1e5) / 1e5, long: Math.round(long * 1e5) / 1e5 };
}

/**
 * Keeps only the event fields the schedule needs, so cached state stays small.
 * Drops testing (round 500) and other non-championship events.
 */
export function slimEvents(events) {
  if (!Array.isArray(events)) return [];
  const slim = [];
  for (const e of events) {
    const round = Number(e?.intRound);
    if (!Number.isInteger(round) || round < 1 || round > 99) continue;
    if (typeof e.strEvent !== 'string' || !e.strEvent.trim()) continue;
    slim.push({
      round,
      name: e.strEvent.trim().replace(/\s+/g, ' '),
      timestamp: typeof e.strTimestamp === 'string' ? e.strTimestamp : null,
      date: typeof e.dateEvent === 'string' ? e.dateEvent : null,
      venueId: typeof e.idVenue === 'string' && /^[1-9]\d{0,9}$/.test(e.idVenue) ? e.idVenue : null,
      venue: typeof e.strVenue === 'string' ? e.strVenue : '',
      country: typeof e.strCountry === 'string' ? e.strCountry : '',
    });
  }
  return slim;
}

/**
 * Keeps only the venue fields the schedule needs.
 */
export function slimVenue(data) {
  const v = Array.isArray(data?.venues) ? data.venues[0] : null;
  if (!v) return null;
  return {
    name: typeof v.strVenue === 'string' ? v.strVenue : '',
    locality: typeof v.strLocation === 'string' ? v.strLocation : '',
    country: typeof v.strCountry === 'string' ? v.strCountry : '',
    coords: parseCoordinates(v.strMap),
  };
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/;

/**
 * Converts an event's UTC timestamp to Ergast-style date/time fields.
 */
function toErgastDateTime(event) {
  const match = event.timestamp?.match(TIMESTAMP_REGEX);
  if (match) return { date: match[1], time: `${match[2]}Z` };
  if (event.date && DATE_REGEX.test(event.date)) return { date: event.date };
  return null;
}

function slugify(label) {
  return label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'session';
}

// Accent- and case-insensitive word comparison ("Montreal" vs "Montréal")
function foldWord(word) {
  return word?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * How many leading words every event name in a round shares, e.g. 1 ("Miami") for
 * "Miami Practice" / "Miami Feature Race", or 2 ("Miami ePrix") for Formula E.
 */
function commonPrefixLength(names) {
  const split = names.map(n => n.split(' ').map(foldWord));
  let length = 0;
  while (length < split[0].length && split.every(words => words[length] === split[0][length])) length++;
  return length;
}

/**
 * Builds one Ergast-shaped race (plus a ready-made sessions array) from the events
 * of a round and the venue lookups.
 * @param {number} round
 * @param {Array} events  slimEvents() output for the round
 * @param {Object} venues venueId → slimVenue() output
 * @returns {Object|null} null when no event has a usable date
 */
export function buildRace(round, events, venues, { f1Layouts = true } = {}) {
  const dated = events
    .map(e => ({ event: e, dt: toErgastDateTime(e) }))
    .filter(item => item.dt)
    .sort((a, b) => `${a.dt.date}T${a.dt.time ?? ''}`.localeCompare(`${b.dt.date}T${b.dt.time ?? ''}`));
  if (dated.length === 0) return null;

  // A single event is the race itself, so its whole name is the base.
  const prefixLength = commonPrefixLength(dated.map(item => item.event.name));

  // The headline race is the event named after the round itself, otherwise the last one
  // (e.g. the F2/F3 Feature Race).
  const mainIndex = dated.findIndex(item => item.event.name.split(' ').length === prefixLength);
  const main = dated[mainIndex === -1 ? dated.length - 1 : mainIndex];
  const base = main.event.name.split(' ').slice(0, prefixLength).join(' ');

  const usedIds = new Set();
  const sessions = dated.map(({ event, dt }) => {
    const label = event.name.split(' ').slice(prefixLength).join(' ') || 'Race';
    let id = slugify(label);
    for (let n = 2; usedIds.has(id); n++) id = `${slugify(label)}-${n}`;
    usedIds.add(id);
    return { id, name: label, ...dt };
  });

  // The most common venue across the round: some events have no venue set.
  const counts = new Map();
  for (const e of events) if (e.venueId) counts.set(e.venueId, (counts.get(e.venueId) ?? 0) + 1);
  const venueId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const venue = venueId ? venues[venueId] : null;
  const named = events.find(e => e.venue) ?? events[0];

  return {
    round: String(round),
    raceName: base,
    date: main.dt.date,
    ...(main.dt.time ? { time: main.dt.time } : {}),
    Circuit: {
      circuitId: (f1Layouts && venueId && VENUE_CIRCUIT_MAP[venueId]) || null,
      circuitName: venue?.name || named.venue || '',
      Location: {
        lat: venue?.coords ? String(venue.coords.lat) : '',
        long: venue?.coords ? String(venue.coords.long) : '',
        locality: venue?.locality || '',
        country: venue?.country || named.country || '',
      },
    },
    sessions,
  };
}
