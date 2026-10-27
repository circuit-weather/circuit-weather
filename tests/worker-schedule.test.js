import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/worker.js';
import {
  handleScheduleRequest,
  throttle,
  emptyState,
  planFetches,
  getRoundTtlMs,
  FILL_BUDGET,
  SEASON_TTL_MS,
  SEASON_END_TTL_MS,
  VENUE_TTL_MS,
} from '../src/handlers/schedule.js';

// --- Cache API mock ---
const cacheStore = new Map();
const mockCache = {
  match: vi.fn(async (request) => cacheStore.get(request.url)?.clone()),
  put: vi.fn(async (request, response) => { cacheStore.set(request.url, response.clone()); }),
};
vi.stubGlobal('caches', { default: mockCache });

const STATE_KEY = 'https://thesportsdb.internal/state/f2';
const COOLDOWN_KEY = 'https://thesportsdb.internal/cooldown';
const RESPONSE_KEY = 'https://circuit-weather.racing/api/schedule/f2';
const NOW = Date.parse('2026-10-25T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// A fake F2 season: rounds 1..lastRound, one venue per round, round `next` upcoming
function fakeUpstream({ lastRound = 3, next = 2, season = '2026', venueMap = '37°50′59″S 144°58′6″E' } = {}) {
  const calls = [];
  const handler = vi.fn(async (url) => {
    const u = new URL(url);
    const path = u.pathname.split('/').pop();
    const p = u.searchParams;
    calls.push(`${path}${p.get('r') ? `:${p.get('r')}` : p.get('id') && path === 'lookupvenue.php' ? `:${p.get('id')}` : ''}`);
    if (path === 'lookupleague.php') return jsonResponse({ leagues: [{ strCurrentSeason: season }] });
    if (path === 'eventsnextleague.php') {
      return jsonResponse({ events: next ? [{ intRound: String(next), strEvent: `R${next} Practice` }] : null });
    }
    if (path === 'eventsround.php') {
      const r = Number(p.get('r'));
      if (r > lastRound) return jsonResponse({ events: null });
      const day = String(r).padStart(2, '0');
      return jsonResponse({
        events: [
          { intRound: String(r), strEvent: `R${r} Practice`, strTimestamp: `2026-11-${day}T10:00:00`, idVenue: String(100 + r), strVenue: `Venue ${r}`, strCountry: 'Australia' },
          { intRound: String(r), strEvent: `R${r} Feature Race`, strTimestamp: `2026-11-${day}T15:00:00`, idVenue: String(100 + r), strVenue: `Venue ${r}`, strCountry: 'Australia' },
        ],
      });
    }
    if (path === 'lookupvenue.php') {
      return jsonResponse({ venues: [{ strVenue: `Venue ${p.get('id')}`, strLocation: 'Melbourne', strCountry: 'Australia', strMap: venueMap }] });
    }
    return jsonResponse({}, 404);
  });
  return { handler, calls };
}

describe('Worker /api/schedule/{series}', () => {
  let env;
  let ctx;
  let pending;

  beforeEach(() => {
    cacheStore.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    throttle.calls = [];
    throttle.cooldownUntil = 0;
    throttle.limit = 1000;
    env = { ENVIRONMENT: 'test' };
    pending = [];
    ctx = { waitUntil: vi.fn((p) => pending.push(p)) };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    throttle.limit = 20;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const request = (path, headers = {}) =>
    new Request(`https://circuit-weather.racing${path}`, { headers: { 'Sec-Fetch-Site': 'same-origin', ...headers } });

  // Calls the handler directly: the Worker's per-IP limiter never refills with a frozen clock
  const get = async (series = 'f2', headers) => {
    const req = request(`/api/schedule/${series}`, headers);
    const res = await handleScheduleRequest(req, env, ctx, new URL(req.url));
    await Promise.all(pending);
    pending = [];
    return res;
  };

  // Each fill writes the assembled response to the cache; drop it to force another fill
  const getFresh = async (series = 'f2') => {
    cacheStore.delete(`https://circuit-weather.racing/api/schedule/${series}`);
    return get(series);
  };

  const fillUntilComplete = async () => {
    for (let i = 0; i < 10; i++) {
      const body = await (await getFresh()).json();
      if (body.complete) return body;
    }
    throw new Error('never completed');
  };

  it('is routed by the Worker', async () => {
    vi.stubGlobal('fetch', fakeUpstream().handler);
    const res = await worker.fetch(request('/api/schedule/f2'), env, ctx);
    await Promise.all(pending);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('rejects unknown series and nested paths', async () => {
    for (const path of ['f1', 'wec', 'f2/extra', '', '__proto__', 'hasOwnProperty']) {
      const res = await get(path);
      expect(res.status).toBe(404);
    }
  });

  it('rejects script/object destinations (XSSI)', async () => {
    const res = await get('f2', { 'Sec-Fetch-Dest': 'script' });
    expect(res.status).toBe(403);
  });

  it('builds a season within the budget, nearest the next round first', async () => {
    const upstream = fakeUpstream({ lastRound: 12, next: 8 });
    vi.stubGlobal('fetch', upstream.handler);

    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(upstream.handler).toHaveBeenCalledTimes(FILL_BUDGET);
    expect(upstream.calls.slice(0, 6)).toEqual([
      'lookupleague.php', 'eventsnextleague.php',
      'eventsround.php:8', 'eventsround.php:9', 'eventsround.php:7', 'eventsround.php:10',
    ]);
    // Rounds either side of the next one, before older rounds
    expect(upstream.calls.slice(6)).toEqual(['eventsround.php:6', 'eventsround.php:11', 'eventsround.php:5', 'eventsround.php:12']);
    expect(body.complete).toBe(false);
    expect(body.races.map(r => r.round)).toEqual(['5', '6', '7', '8', '9', '10', '11', '12']);
    expect(body.races.find(r => r.round === '8').sessions.map(s => s.id)).toEqual(['practice', 'feature-race']);
    // Partial responses are only cached briefly
    expect(cacheStore.get(RESPONSE_KEY).headers.get('Cache-Control')).toBe('public, max-age=60');
    // Secret-free internal key holds the state
    expect(cacheStore.get(STATE_KEY).headers.get('Cache-Control')).toBe('public, max-age=15552000');
  });

  it('completes over several requests with venues and the season end', async () => {
    vi.stubGlobal('fetch', fakeUpstream({ lastRound: 3, next: 2 }).handler);

    const body = await fillUntilComplete();
    expect(body).toMatchObject({ series: 'f2', season: '2026', complete: true });
    expect(body.races.map(r => r.round)).toEqual(['1', '2', '3']);
    expect(body.races[0].Circuit).toEqual({
      circuitId: null,
      circuitName: 'Venue 101',
      Location: { lat: '-37.84972', long: '144.96833', locality: 'Melbourne', country: 'Australia' },
    });
    expect(cacheStore.get(RESPONSE_KEY).headers.get('Cache-Control')).toBe('public, max-age=900');
  });

  it('serves the assembled schedule from cache with strict CORS', async () => {
    const upstream = fakeUpstream();
    vi.stubGlobal('fetch', upstream.handler);
    await get();
    upstream.handler.mockClear();

    const res = await get('f2', { Origin: 'https://evil.example' });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Cache')).toBe('HIT');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(upstream.handler).not.toHaveBeenCalled();
  });

  it('makes no upstream calls once everything is fresh', async () => {
    const upstream = fakeUpstream();
    vi.stubGlobal('fetch', upstream.handler);
    await fillUntilComplete();
    upstream.handler.mockClear();

    const res = await getFresh();
    expect((await res.json()).complete).toBe(true);
    expect(upstream.handler).not.toHaveBeenCalled();
  });

  it('refreshes stale rounds, the next round and the season end on schedule', async () => {
    const upstream = fakeUpstream();
    vi.stubGlobal('fetch', upstream.handler);
    await fillUntilComplete();

    vi.setSystemTime(NOW + SEASON_END_TTL_MS);
    upstream.calls.length = 0;
    await getFresh();
    // Season name and next round daily; upcoming rounds daily; end-of-season probe daily
    expect(upstream.calls).toEqual(expect.arrayContaining([
      'lookupleague.php', 'eventsnextleague.php', 'eventsround.php:1', 'eventsround.php:2', 'eventsround.php:3', 'eventsround.php:4',
    ]));
    expect(upstream.calls.some(c => c.startsWith('lookupvenue'))).toBe(false);
  });

  it('follows up a round added after the known end of the season', async () => {
    const upstream = fakeUpstream({ lastRound: 2 });
    vi.stubGlobal('fetch', upstream.handler);
    expect((await fillUntilComplete()).races).toHaveLength(2);

    vi.stubGlobal('fetch', fakeUpstream({ lastRound: 3 }).handler);
    vi.setSystemTime(NOW + SEASON_END_TTL_MS);
    const body = await fillUntilComplete();
    expect(body.races.map(r => r.round)).toEqual(['1', '2', '3']);
  });

  it('starts over when the season changes, keeping venues', async () => {
    vi.stubGlobal('fetch', fakeUpstream({ season: '2026' }).handler);
    await fillUntilComplete();

    const upstream = fakeUpstream({ season: '2027', lastRound: 1, next: 1 });
    vi.stubGlobal('fetch', upstream.handler);
    vi.setSystemTime(NOW + SEASON_TTL_MS);
    const body = await fillUntilComplete();
    expect(body.season).toBe('2027');
    expect(body.races.map(r => r.round)).toEqual(['1']);
    expect(upstream.calls.some(c => c.startsWith('lookupvenue'))).toBe(false);
  });

  it('handles a finished season with no next round', async () => {
    vi.stubGlobal('fetch', fakeUpstream({ next: null, lastRound: 2 }).handler);
    const body = await fillUntilComplete();
    expect(body.races).toHaveLength(2);
  });

  it('pauses all calls after a 429 and shares the cooldown through the cache', async () => {
    const upstream = fakeUpstream();
    upstream.handler.mockImplementationOnce(async () => jsonResponse({}, 429));
    vi.stubGlobal('fetch', upstream.handler);

    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect((await res.clone().json()).error.reason).toBe('rate_limited');
    expect(upstream.handler).toHaveBeenCalledTimes(1);
    expect(cacheStore.has(COOLDOWN_KEY)).toBe(true);

    // Another isolate (fresh throttle) still honours the shared marker
    throttle.cooldownUntil = 0;
    upstream.handler.mockClear();
    const cooling = await getFresh();
    expect(upstream.handler).not.toHaveBeenCalled();
    expect(throttle.isCoolingDown()).toBe(true);
    expect((await cooling.json()).error.reason).toBe('cooldown');

    // After the cooldown, filling resumes
    vi.setSystemTime(NOW + 61000);
    const after = await getFresh();
    expect(after.status).toBe(200);
    expect(upstream.handler).toHaveBeenCalled();
  });

  it('ignores an expired cooldown marker', async () => {
    cacheStore.set(COOLDOWN_KEY, new Response(String(NOW - 1)));
    const upstream = fakeUpstream();
    vi.stubGlobal('fetch', upstream.handler);
    expect((await get()).status).toBe(200);
  });

  it('stops filling when the per-isolate throttle runs out', async () => {
    throttle.limit = 3;
    const upstream = fakeUpstream({ lastRound: 10, next: 5 });
    vi.stubGlobal('fetch', upstream.handler);

    const body = await (await get()).json();
    expect(upstream.handler).toHaveBeenCalledTimes(3);
    expect(body.races.map(r => r.round)).toEqual(['5']);
    // Refused by our own throttle, not upstream: no shared cooldown
    expect(cacheStore.has(COOLDOWN_KEY)).toBe(false);
  });

  it('keeps serving the last good copy when upstream fails', async () => {
    vi.stubGlobal('fetch', fakeUpstream().handler);
    const good = await fillUntilComplete();

    const failing = vi.fn(async () => jsonResponse({}, 500));
    vi.stubGlobal('fetch', failing);
    vi.setSystemTime(NOW + 31 * DAY);
    const body = await (await getFresh()).json();
    expect(failing).toHaveBeenCalled();
    expect(body.races).toEqual(good.races);
  });

  it('keeps a known round when it comes back empty', async () => {
    const upstream = fakeUpstream();
    vi.stubGlobal('fetch', upstream.handler);
    const good = await fillUntilComplete();

    vi.stubGlobal('fetch', vi.fn(async (url) => (url.includes('eventsround') ? jsonResponse({ events: null }) : upstream.handler(url))));
    vi.setSystemTime(NOW + DAY);
    const body = await (await getFresh()).json();
    expect(body.races.map(r => r.round)).toEqual(good.races.map(r => r.round));
  });

  it('returns 503 with the reason when nothing can be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const res = await get();
    expect(res.status).toBe(503);
    expect((await res.json()).error.reason).toBe('network');
    expect(console.error).toHaveBeenCalledWith('TheSportsDB f2 schedule unavailable:', 'network');
  });

  it('reports blocked upstream responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>challenge</html>', { status: 403 })));
    expect((await (await get()).json()).error.reason).toBe('http_403');
  });

  it('reports no_data when upstream answers but has nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ leagues: [{ strCurrentSeason: '2026' }], events: null })));
    expect((await (await get()).json()).error.reason).toBe('no_data');
  });

  it('keeps production logs quiet', async () => {
    env.ENVIRONMENT = 'production';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await get();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('ignores an invalid season name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ leagues: [{ strCurrentSeason: '../../x' }] })));
    expect((await get()).status).toBe(503);
  });

  it('rebuilds from a corrupt or outdated state entry', async () => {
    cacheStore.set(STATE_KEY, new Response('not json'));
    vi.stubGlobal('fetch', fakeUpstream().handler);
    expect((await get()).status).toBe(200);

    cacheStore.clear();
    cacheStore.set(STATE_KEY, jsonResponse({ version: 0, series: 'f2', rounds: {}, venues: {} }));
    vi.stubGlobal('fetch', fakeUpstream().handler);
    expect((await get()).status).toBe(200);
  });

  it('refetches venues after their TTL', async () => {
    const upstream = fakeUpstream();
    vi.stubGlobal('fetch', upstream.handler);
    await fillUntilComplete();

    vi.setSystemTime(NOW + VENUE_TTL_MS);
    upstream.calls.length = 0;
    await fillUntilComplete();
    expect(upstream.calls).toContain('lookupvenue.php:101');
  });

  it('uses the THESPORTSDB_API_KEY secret', async () => {
    const upstream = fakeUpstream();
    vi.stubGlobal('fetch', upstream.handler);
    env.THESPORTSDB_API_KEY = 'premium42';
    await get();
    expect(upstream.handler.mock.calls[0][0]).toContain('/api/v1/json/premium42/');
  });
});

describe('getRoundTtlMs', () => {
  const at = (iso) => ({ timestamp: iso.replace('Z', ''), date: iso.slice(0, 10) });

  it('refreshes race weekends hourly', () => {
    const events = [at('2026-10-24T12:00:00Z'), at('2026-10-26T12:00:00Z')];
    expect(getRoundTtlMs(events, NOW)).toBe(HOUR);
    expect(getRoundTtlMs(events, Date.parse('2026-10-21T12:00:00Z'))).toBe(HOUR);
  });

  it('refreshes finished rounds monthly and upcoming rounds daily', () => {
    expect(getRoundTtlMs([at('2026-09-01T12:00:00Z')], NOW)).toBe(30 * DAY);
    expect(getRoundTtlMs([at('2026-12-01T12:00:00Z')], NOW)).toBe(DAY);
  });

  it('uses the date when there is no timestamp, and a day when there is neither', () => {
    expect(getRoundTtlMs([{ timestamp: null, date: '2026-01-01' }], NOW)).toBe(30 * DAY);
    expect(getRoundTtlMs([{ timestamp: null, date: null }], NOW)).toBe(DAY);
  });
});

describe('planFetches', () => {
  it('probes several rounds ahead while the season end is unknown', () => {
    const state = emptyState('f2');
    expect(planFetches(state, NOW).map(t => `${t.type}:${t.round}`)).toEqual(['end:1', 'end:2', 'end:3', 'end:4']);
  });

  it('does not probe past the round limit', () => {
    const state = { ...emptyState('f2'), lastRound: 40, endFetchedAt: 0 };
    for (let r = 1; r <= 40; r++) state.rounds[r] = { fetchedAt: NOW, events: [] };
    expect(planFetches(state, NOW)).toEqual([]);
  });

  it('orders stale rounds by how overdue they are', () => {
    const state = { ...emptyState('f2'), lastRound: 2, endFetchedAt: NOW };
    state.rounds[1] = { fetchedAt: NOW - 3 * DAY, events: [] };
    state.rounds[2] = { fetchedAt: NOW - 5 * DAY, events: [] };
    expect(planFetches(state, NOW).map(t => t.round)).toEqual([2, 1]);
  });
});
