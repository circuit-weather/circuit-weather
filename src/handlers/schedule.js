/**
 * /api/schedule/{series} — season schedules for non-F1 series from TheSportsDB.
 *
 * TheSportsDB's free tier only returns 15 events from its season endpoint, so the
 * season is built one round at a time (eventsround.php) plus one venue lookup per
 * circuit for its coordinates. That is ~40 upstream calls per series against a
 * 30 requests/minute limit, so:
 *
 * - Everything fetched is kept in one "season state" cache entry per series, with a
 *   fetchedAt time per item. Freshness is decided here rather than by Cache-Control,
 *   so an item that cannot be refreshed is still served (last known good).
 * - Each request makes at most FILL_BUDGET upstream calls (also keeping the Worker
 *   well under its subrequest limit). A cold cache fills over a few requests; until
 *   then the response is marked `complete: false` and cached briefly.
 * - Past rounds are refreshed monthly, upcoming rounds daily and race weekends
 *   hourly, so normal traffic costs a handful of upstream calls a day.
 * - A 429 stops all calls for RATE_LIMIT_COOLDOWN_MS, shared across isolates in the
 *   data centre through a cache marker.
 * - The season state is also kept in Workers KV (the SCHEDULE_KV binding), shared by
 *   every data centre. TheSportsDB often rate limits the Worker's shared outgoing
 *   addresses and the Cache API copy is per data centre and can be evicted, so
 *   without it a 429 could leave a data centre with nothing to serve. Each request
 *   uses the newer of the two copies; KV is written at most every
 *   KV_SAVE_INTERVAL_MS per series (the free plan allows 1,000 writes a day).
 */

import {
  checkFetchDest,
  API_SECURITY_HEADERS,
  setCorsHeaders,
  createErrorResponse,
  createCacheHitResponse
} from '../worker-utils.js';
import {
  SERIES,
  RATE_LIMIT_COOLDOWN_MS,
  UpstreamThrottle,
  fetchTheSportsDb,
  slimEvents,
  slimVenue,
  buildRace
} from '../thesportsdb.js';

const STATE_VERSION = 1;
// Internal cache keys (never fetched): the Cache API only needs a unique URL
const INTERNAL_ORIGIN = 'https://thesportsdb.internal';
const STATE_CACHE_TTL = 180 * 24 * 60 * 60; // Kept long so it doubles as last known good
const COOLDOWN_KEY = `${INTERNAL_ORIGIN}/cooldown`;
// Ten series, each written to KV at most every 30 minutes: under 500 writes a day
export const KV_SAVE_INTERVAL_MS = 30 * 60 * 1000;
const kvKey = (series) => `state/${series}`;

// Upstream calls per request: a cold cache fills over a few requests, and one data
// centre stays well under the 30/minute limit and the Worker subrequest limit
export const FILL_BUDGET = 10;
const PARALLEL_FETCHES = 4;
const MAX_ROUNDS = 40;
const SEASON_REGEX = /^\d{4}(-\d{4})?$/;
const EMPTY_VENUE = Object.freeze({ name: '', locality: '', country: '', coords: null });

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const SEASON_TTL_MS = DAY_MS;
export const SEASON_END_TTL_MS = DAY_MS;
export const NEXT_ROUND_TTL_MS = 6 * HOUR_MS;
export const VENUE_TTL_MS = 90 * DAY_MS;
// How often a finished season checks whether next season's opener is listed yet
export const ROLLOVER_TTL_MS = DAY_MS;
// A season counts as finished this long after its last event starts, so a final
// race (or a 24-hour race) is never swapped out while it runs
const SEASON_OVER_AFTER_MS = 2 * DAY_MS;
// Assembled response caching
const COMPLETE_RESPONSE_TTL = 15 * 60;
const PARTIAL_RESPONSE_TTL = 60;

// Shared by every request handled by this isolate
export const throttle = new UpstreamThrottle();

/**
 * How long a fetched round stays fresh, based on how close it is to now.
 */
export function getRoundTtlMs(events, now) {
  const times = events
    .map(e => Date.parse(e.timestamp ? `${e.timestamp}Z` : `${e.date}T00:00:00Z`))
    .filter(Number.isFinite);
  if (times.length === 0) return DAY_MS;
  const first = Math.min(...times);
  const last = Math.max(...times);
  // Race weekend (from 3 days before until 1 day after): times can still move
  if (now >= first - 3 * DAY_MS && now <= last + DAY_MS) return HOUR_MS;
  // Finished: only corrections expected
  if (now > last + DAY_MS) return 30 * DAY_MS;
  return DAY_MS;
}

export function emptyState(series) {
  return {
    version: STATE_VERSION, series,
    season: null, seasonFetchedAt: 0,
    nextRound: null, nextFetchedAt: 0,
    lastRound: null, endFetchedAt: 0,
    rolloverFetchedAt: 0,
    // The league's next event is next season's: nothing is left in this one
    followingListed: false,
    rounds: {}, venues: {},
  };
}

function stateKey(series) {
  return new Request(`${INTERNAL_ORIGIN}/state/${series}`);
}

const isValidState = (state, series) =>
  state?.version === STATE_VERSION && state.series === series && Boolean(state.rounds && state.venues);

async function readCachedState(cache, series) {
  try {
    const cached = await cache.match(stateKey(series));
    const state = cached ? await cached.json() : null;
    return isValidState(state, series) ? state : null;
  } catch {
    return null; // Corrupt entry: ignored
  }
}

async function readStoredState(env, series) {
  if (!env?.SCHEDULE_KV) return null;
  try {
    const state = await env.SCHEDULE_KV.get(kvKey(series), 'json');
    return isValidState(state, series) ? state : null;
  } catch {
    return null; // KV unavailable or corrupt: the cache copy (or a rebuild) will do
  }
}

/**
 * The newer of this data centre's cached state and the shared copy in KV, which
 * holds what other data centres fetched (or survives this one's cache eviction).
 */
async function loadState(cache, series, env) {
  const copies = (await Promise.all([readCachedState(cache, series), readStoredState(env, series)])).filter(Boolean);
  if (copies.length === 0) return emptyState(series);
  return copies.reduce((a, b) => ((b.savedAt ?? 0) > (a.savedAt ?? 0) ? b : a));
}

/**
 * Saves the state to this data centre's cache, and to KV when a KV write is due.
 * With changed false (nothing new fetched) it only catches KV up: a change made
 * within KV_SAVE_INTERVAL_MS of the last KV write is held back, and would
 * otherwise never reach KV if nothing changed afterwards.
 */
function saveState(cache, state, ctx, env, now, { changed = true } = {}) {
  const kvDue = Boolean(env?.SCHEDULE_KV) && now - (state.kvSavedAt ?? 0) >= KV_SAVE_INTERVAL_MS;
  const kvBehind = (state.savedAt ?? 0) > (state.kvSavedAt ?? 0);
  if (!changed && !(kvDue && kvBehind)) return;
  if (changed) state.savedAt = now;
  if (kvDue) state.kvSavedAt = now;
  const body = JSON.stringify(state);
  ctx.waitUntil(cache.put(stateKey(state.series), new Response(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${STATE_CACHE_TTL}` },
  })));
  if (kvDue) {
    // A failed write (e.g. the daily write limit) only means this copy stays local
    // Expires like the cache copy: the privacy policy keeps the last copy up to 180 days
    ctx.waitUntil(env.SCHEDULE_KV.put(kvKey(state.series), body, { expirationTtl: STATE_CACHE_TTL }).catch(() => {}));
  }
}

async function isCoolingDown(cache) {
  if (throttle.isCoolingDown()) return true;
  try {
    const marker = await cache.match(new Request(COOLDOWN_KEY));
    if (!marker) return false;
    const until = Number(await marker.text());
    if (Number.isFinite(until) && until > Date.now()) {
      throttle.startCooldown(until);
      return true;
    }
  } catch {
    // Missing marker is the normal case
  }
  return false;
}

function recordCooldown(cache, ctx) {
  ctx.waitUntil(cache.put(new Request(COOLDOWN_KEY), new Response(String(throttle.cooldownUntil), {
    headers: { 'Cache-Control': `public, max-age=${Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000)}` },
  })));
}

/**
 * Works out which rounds still need fetching, most important first: missing rounds
 * and end-of-season probes nearest the next round (so upcoming rounds come before
 * old ones), then stale rounds that are most overdue.
 */
export function planFetches(state, now) {
  const known = Object.keys(state.rounds).map(Number);
  const highest = known.length ? Math.max(...known) : 0;
  const upTo = state.lastRound ?? Math.max(highest, state.nextRound ?? 0);
  const anchor = state.nextRound ?? 1;

  const wanted = [];
  const stale = [];
  for (let r = 1; r <= upTo; r++) {
    const entry = state.rounds[r];
    if (!entry) {
      wanted.push({ type: 'round', round: r });
    } else {
      const due = entry.fetchedAt + getRoundTtlMs(entry.events, now);
      if (now >= due) stale.push({ type: 'round', round: r, due });
    }
  }

  // Probe past the highest round until an empty round marks the end of the season.
  // Probe several at once while the end is unknown; once known, recheck it daily.
  if (state.lastRound === null) {
    for (let r = upTo + 1; r <= Math.min(upTo + PARALLEL_FETCHES, MAX_ROUNDS); r++) wanted.push({ type: 'end', round: r });
  } else if (now - state.endFetchedAt >= SEASON_END_TTL_MS && state.lastRound < MAX_ROUNDS) {
    wanted.push({ type: 'end', round: state.lastRound + 1 });
  }

  // Ties (one round either side of the next) go to the later round
  wanted.sort((a, b) => Math.abs(a.round - anchor) - Math.abs(b.round - anchor) || b.round - a.round);
  stale.sort((a, b) => a.due - b.due);
  return [...wanted, ...stale];
}

function venuesToFetch(state, now) {
  const ids = new Set();
  for (const entry of Object.values(state.rounds)) {
    for (const e of entry.events) if (e.venueId) ids.add(e.venueId);
  }
  return [...ids].filter(id => {
    const v = state.venues[id];
    return !v || now - v.fetchedAt >= VENUE_TTL_MS;
  });
}

const seasonYear = (season) => Number(season.slice(0, 4));

/** The season after this one: '2026' → '2027', '2025-2026' → '2026-2027'. */
export function followingSeason(season) {
  if (typeof season !== 'string' || !SEASON_REGEX.test(season)) return null;
  const [start, end] = season.split('-').map(Number);
  return end ? `${start + 1}-${end + 1}` : String(start + 1);
}

/**
 * Whether every round of the season is known and its last event is well past.
 */
export function isSeasonOver(state, now) {
  if (state.lastRound === null || state.lastRound < 1) return false;
  let last = -Infinity;
  for (let r = 1; r <= state.lastRound; r++) {
    const entry = state.rounds[r];
    if (!entry) return false;
    for (const e of entry.events) {
      const t = Date.parse(e.timestamp ? `${e.timestamp}Z` : `${e.date}T00:00:00Z`);
      if (Number.isFinite(t) && t > last) last = t;
    }
  }
  return Number.isFinite(last) && now >= last + SEASON_OVER_AFTER_MS;
}

/**
 * Whether every round fetched so far (at least one) is well past. With the league
 * listing next season's opener as its next event, that marks the season as over
 * before all its rounds are known, which can take a while when TheSportsDB is
 * rate limiting the Worker.
 */
function knownRoundsOver(state, now) {
  const entries = Object.values(state.rounds);
  if (entries.length === 0) return false;
  return entries.every(entry => entry.events.every(e => {
    const t = Date.parse(e.timestamp ? `${e.timestamp}Z` : `${e.date}T00:00:00Z`);
    return !Number.isFinite(t) || now >= t + SEASON_OVER_AFTER_MS;
  }));
}

/**
 * The latest valid season given: the league's current season plus the seasons of
 * its finished events. Some leagues (e.g. IMSA) leave strCurrentSeason on last
 * year all season. Ties keep the earlier argument.
 */
export function pickSeason(...seasons) {
  const valid = seasons.filter(s => typeof s === 'string' && SEASON_REGEX.test(s));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (seasonYear(b) > seasonYear(a) ? b : a));
}

/**
 * Refreshes the season name and the next round number when they are stale.
 */
async function refreshLeague(state, leagueId, now, spend) {
  if (!state.season || now - state.seasonFetchedAt >= SEASON_TTL_MS) {
    const league = await spend(`lookupleague.php?id=${leagueId}`);
    const past = league.limited ? league : await spend(`eventspastleague.php?id=${leagueId}`);
    const pastEvents = past.ok && Array.isArray(past.data?.events) ? past.data.events : [];
    // The season already held stays unless a later one is listed, so moving on to
    // next season's opener (see rollOverSeason) isn't undone by strCurrentSeason
    const season = pickSeason(
      state.season,
      league.ok ? league.data?.leagues?.[0]?.strCurrentSeason : null,
      ...pastEvents.map(e => e?.strSeason),
    );
    if (season) {
      if (season !== state.season) {
        // New season: venues stay valid, rounds do not
        Object.assign(state, { season, rounds: {}, lastRound: null, endFetchedAt: 0, nextRound: null, nextFetchedAt: 0, rolloverFetchedAt: 0, followingListed: false });
      }
      state.seasonFetchedAt = now;
    }
  }
  // A state saved before followingListed existed checks straight away rather than
  // waiting out the TTL, so a finished season can move on at once
  const nextDue = now - state.nextFetchedAt >= NEXT_ROUND_TTL_MS || state.followingListed === undefined;
  if (state.season && nextDue) {
    const res = await spend(`eventsnextleague.php?id=${leagueId}`);
    if (res.ok) {
      // Empty once the season has finished. Some leagues already list next season's
      // opener here, which is not a round of this season.
      const events = Array.isArray(res.data?.events) ? res.data.events : [];
      const next = slimEvents(events.filter(e => !e?.strSeason || e.strSeason === state.season))[0];
      state.nextRound = next ? next.round : null;
      const following = followingSeason(state.season);
      state.followingListed = !next && events.some(e => e?.strSeason === following);
      state.nextFetchedAt = now;
    }
  }
}

/**
 * Once the season is over, moves on to next season as soon as TheSportsDB lists
 * its first round, so that round is the next one rather than nothing. Checked
 * daily: next season's calendar can appear any time over the break.
 *
 * Over means every round is known and the last is well past, or, sooner, that the
 * league's next event is next season's and every round fetched so far is well past
 * (e.g. IndyCar in November, with only some of its finished season fetched).
 */
async function rollOverSeason(state, leagueId, now, spend) {
  const over = isSeasonOver(state, now) || (state.followingListed === true && knownRoundsOver(state, now));
  if (!over || now - (state.rolloverFetchedAt ?? 0) < ROLLOVER_TTL_MS) return;
  const next = followingSeason(state.season);
  if (!next) return;
  const res = await spend(`eventsround.php?id=${leagueId}&r=1&s=${next}`);
  if (!res.ok) return;
  state.rolloverFetchedAt = now;
  const events = slimEvents(res.data?.events);
  if (events.length === 0) return;
  // New season: venues stay valid, rounds do not
  Object.assign(state, {
    season: next, seasonFetchedAt: now,
    rounds: { 1: { fetchedAt: now, events } },
    lastRound: null, endFetchedAt: 0,
    nextRound: 1, nextFetchedAt: now,
    rolloverFetchedAt: 0, followingListed: false,
  });
}

/**
 * Refreshes as much of the season state as the budget and rate limit allow.
 * Mutates state.
 * @returns {Promise<{changed: boolean, limited: boolean, failure: string|null}>}
 *   failure is the reason the first failed upstream call gave, if any
 */
export async function fillState(state, leagueId, env, now) {
  let budget = FILL_BUDGET;
  let limited = false;
  let failure = null;
  const before = JSON.stringify(state);

  const spend = async (path) => {
    budget--;
    const res = await fetchTheSportsDb(path, env, throttle);
    if (res.limited) limited = true;
    if (!res.ok) failure ??= res.reason;
    return res;
  };

  await refreshLeague(state, leagueId, now, spend);
  if (!limited) await rollOverSeason(state, leagueId, now, spend);
  if (!state.season) return { changed: JSON.stringify(state) !== before, limited, failure };

  const attemptedVenues = new Set();
  const fetchVenues = (ids) => Promise.all(ids.map(async (id) => {
    attemptedVenues.add(id);
    const res = await spend(`lookupvenue.php?id=${id}`);
    if (!res.ok) return;
    state.venues[id] = { fetchedAt: now, ...(slimVenue(res.data) ?? EMPTY_VENUE) };
  }));

  // Rounds, a batch at a time, re-planning after each batch so new rounds found by an
  // end-of-season probe are followed up in the same request. Venues the fetched rounds
  // use but that have never been looked up come first: without their coordinates a
  // round can't be shown on the map, so a partial schedule has fewer rounds but each
  // one works.
  const attempted = new Set();
  while (budget > 0 && !limited) {
    const newVenues = venuesToFetch(state, now)
      .filter(id => !state.venues[id] && !attemptedVenues.has(id))
      .slice(0, Math.min(budget, PARALLEL_FETCHES));
    if (newVenues.length > 0) {
      await fetchVenues(newVenues);
      continue;
    }

    const tasks = planFetches(state, now)
      .filter(t => !attempted.has(t.round))
      .slice(0, Math.min(budget, PARALLEL_FETCHES));
    if (tasks.length === 0) break;

    const emptyProbes = [];
    await Promise.all(tasks.map(async (task) => {
      attempted.add(task.round);
      const res = await spend(`eventsround.php?id=${leagueId}&r=${task.round}&s=${state.season}`);
      if (!res.ok) return;
      const events = slimEvents(res.data?.events);
      if (events.length > 0) {
        state.rounds[task.round] = { fetchedAt: now, events };
      } else if (task.type === 'end') {
        emptyProbes.push(task.round);
      } else {
        // A known round came back empty: keep the last good copy, retry later
        state.rounds[task.round].fetchedAt = now;
      }
    }));

    const highest = Math.max(0, ...Object.keys(state.rounds).map(Number));
    if (emptyProbes.length > 0) {
      const end = Math.min(...emptyProbes) - 1;
      // Only trust the end if no round past it exists
      if (end >= highest) {
        state.lastRound = end;
        state.endFetchedAt = now;
      }
    } else if (state.lastRound !== null && highest > state.lastRound) {
      // A round was added after the old end: probe again
      state.lastRound = null;
    }
  }

  // Stale venue coordinates with whatever budget is left
  const venueIds = venuesToFetch(state, now).filter(id => !attemptedVenues.has(id));
  for (let i = 0; i < venueIds.length && budget > 0 && !limited; i += PARALLEL_FETCHES) {
    await fetchVenues(venueIds.slice(i, i + Math.min(budget, PARALLEL_FETCHES)));
  }

  return { changed: JSON.stringify(state) !== before, limited, failure };
}

export function assembleSchedule(state, now) {
  const rounds = Object.keys(state.rounds).map(Number).sort((a, b) => a - b);
  const races = rounds
    .map(r => buildRace(r, state.rounds[r].events, state.venues, SERIES[state.series]))
    .filter(Boolean);
  const lastRound = state.lastRound;
  const complete = lastRound !== null &&
    rounds.length === lastRound &&
    venuesToFetch(state, now).every(id => state.venues[id]);
  return { series: state.series, season: state.season, complete, races };
}

/**
 * Handle /api/schedule/{series}
 */
export async function handleScheduleRequest(request, env, ctx, url) {
  // SEC: Ensure request is not from a script tag (XSSI protection)
  if (!checkFetchDest(request)) {
    return createErrorResponse(request, 403, 'Invalid fetch destination');
  }

  const series = url.pathname.slice('/api/schedule/'.length);
  // SEC: Strict whitelist; also rejects nested paths and encoded input
  if (!Object.hasOwn(SERIES, series)) {
    return createErrorResponse(request, 404, 'Unknown series');
  }

  const cache = caches.default;
  // SEC: Normalise the cache key so query strings cannot bust the cache
  const responseKey = new Request(`${url.origin}/api/schedule/${series}`);
  const cached = await cache.match(responseKey);
  if (cached) return createCacheHitResponse(cached, request);

  const now = Date.now();
  const state = await loadState(cache, series, env);

  // Why upstream gave nothing, returned with a 503 to make failures diagnosable
  let failure = 'cooldown';
  let changed = false;
  if (!(await isCoolingDown(cache))) {
    const result = await fillState(state, SERIES[series].leagueId, env, now);
    failure = result.failure;
    changed = result.changed;
    if (result.limited && throttle.isCoolingDown()) recordCooldown(cache, ctx);
  }
  // Also when nothing changed, so a held-back change still reaches KV
  saveState(cache, state, ctx, env, now, { changed });

  const schedule = assembleSchedule(state, now);
  if (schedule.races.length === 0) {
    if (env.ENVIRONMENT !== 'production') console.error(`TheSportsDB ${series} schedule unavailable:`, failure);
    return createErrorResponse(request, 503, 'Schedule unavailable', { 'Retry-After': '60' }, { reason: failure ?? 'no_data' });
  }

  const body = JSON.stringify(schedule);
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${schedule.complete ? COMPLETE_RESPONSE_TTL : PARTIAL_RESPONSE_TTL}`,
    'X-Cache': 'MISS',
    'Access-Control-Allow-Origin': '*', // Store permissive, override on delivery
    ...API_SECURITY_HEADERS
  });
  ctx.waitUntil(cache.put(responseKey, new Response(body, { status: 200, headers })));

  const clientHeaders = new Headers(headers);
  setCorsHeaders(clientHeaders, request);
  return new Response(body, { status: 200, headers: clientHeaders });
}
