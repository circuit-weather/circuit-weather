import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FREE_API_KEY,
  RATE_LIMIT_COOLDOWN_MS,
  getApiKey,
  UpstreamThrottle,
  fetchTheSportsDb,
  parseCoordinates,
  slimEvents,
  slimVenue,
  buildRace,
} from '../src/thesportsdb.js';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const event = (name, timestamp, extra = {}) => ({
  round: 1, name, timestamp, date: timestamp?.slice(0, 10) ?? null,
  venueId: '27574', venue: 'Albert Park Circuit', country: 'Australia', ...extra,
});

describe('getApiKey', () => {
  it('uses the THESPORTSDB_API_KEY secret', () => {
    expect(getApiKey({ THESPORTSDB_API_KEY: 'abc123' })).toBe('abc123');
  });

  it('falls back to the free key when the secret is missing', () => {
    expect(getApiKey({})).toBe(FREE_API_KEY);
    expect(getApiKey(undefined)).toBe(FREE_API_KEY);
  });

  it('rejects keys that could alter the upstream path', () => {
    expect(getApiKey({ THESPORTSDB_API_KEY: '../v2' })).toBe(FREE_API_KEY);
    expect(getApiKey({ THESPORTSDB_API_KEY: '' })).toBe(FREE_API_KEY);
  });
});

describe('UpstreamThrottle', () => {
  it('allows up to the limit within the window, then refuses', () => {
    const throttle = new UpstreamThrottle(2, 1000);
    expect(throttle.tryAcquire(0)).toBe(true);
    expect(throttle.tryAcquire(10)).toBe(true);
    expect(throttle.tryAcquire(20)).toBe(false);
  });

  it('frees slots as calls leave the window', () => {
    const throttle = new UpstreamThrottle(1, 1000);
    expect(throttle.tryAcquire(0)).toBe(true);
    expect(throttle.tryAcquire(999)).toBe(false);
    expect(throttle.tryAcquire(1000)).toBe(true);
  });

  it('refuses every call during a cooldown and never shortens one', () => {
    const throttle = new UpstreamThrottle(10, 1000);
    throttle.startCooldown(5000);
    throttle.startCooldown(3000);
    expect(throttle.cooldownUntil).toBe(5000);
    expect(throttle.isCoolingDown(4999)).toBe(true);
    expect(throttle.tryAcquire(4999)).toBe(false);
    expect(throttle.isCoolingDown(5000)).toBe(false);
    expect(throttle.tryAcquire(5000)).toBe(true);
  });

  it('defaults to the free-tier headroom limit', () => {
    const throttle = new UpstreamThrottle();
    expect(throttle.limit).toBe(20);
    expect(throttle.windowMs).toBe(60000);
  });
});

describe('fetchTheSportsDb', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls the v1 API with the configured key and returns the parsed body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ leagues: [] }));
    const res = await fetchTheSportsDb('lookupleague.php?id=4486', { THESPORTSDB_API_KEY: 'premium9' }, new UpstreamThrottle());
    expect(res).toEqual({ ok: true, data: { leagues: [] } });
    expect(mockFetch.mock.calls[0][0]).toBe('https://www.thesportsdb.com/api/v1/json/premium9/lookupleague.php?id=4486');
  });

  it('parses JSON even when the content type is wrong', async () => {
    mockFetch.mockResolvedValue(new Response('{"events":null}', { headers: { 'Content-Type': 'text/html' } }));
    const res = await fetchTheSportsDb('x', {}, new UpstreamThrottle());
    expect(res).toEqual({ ok: true, data: { events: null } });
  });

  it('does not call upstream when the throttle refuses', async () => {
    const throttle = new UpstreamThrottle(0);
    const res = await fetchTheSportsDb('x', {}, throttle);
    expect(res).toEqual({ ok: false, limited: true, reason: 'throttled' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('starts a cooldown on 429', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 429));
    const throttle = new UpstreamThrottle();
    const before = Date.now();
    const res = await fetchTheSportsDb('x', {}, throttle);
    expect(res).toEqual({ ok: false, limited: true, reason: 'rate_limited' });
    expect(throttle.cooldownUntil).toBeGreaterThanOrEqual(before + RATE_LIMIT_COOLDOWN_MS);
  });

  it('reports other HTTP errors as not limited', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    expect(await fetchTheSportsDb('x', {}, new UpstreamThrottle())).toEqual({ ok: false, limited: false, reason: 'http_500' });
  });

  it('handles network errors without logging the key-bearing URL', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('https://www.thesportsdb.com/api/v1/json/secret/x'), { name: 'TypeError' }));
    const res = await fetchTheSportsDb('x', { THESPORTSDB_API_KEY: 'secret' }, new UpstreamThrottle());
    expect(res).toEqual({ ok: false, limited: false, reason: 'network' });
    expect(console.error).toHaveBeenCalledWith('TheSportsDB fetch failed:', 'TypeError');
  });

  it('reports a non-JSON body (e.g. a bot challenge page) as invalid', async () => {
    mockFetch.mockResolvedValue(new Response('<html>Just a moment...</html>', { headers: { 'Content-Type': 'text/html' } }));
    expect(await fetchTheSportsDb('x', {}, new UpstreamThrottle())).toEqual({ ok: false, limited: false, reason: 'invalid_response' });
  });

  it('stays quiet in production', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));
    await fetchTheSportsDb('x', { ENVIRONMENT: 'production' }, new UpstreamThrottle());
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('parseCoordinates', () => {
  it('parses degrees, minutes and seconds', () => {
    expect(parseCoordinates('37°50′59″S 144°58′6″E')).toEqual({ lat: -37.84972, long: 144.96833 });
    expect(parseCoordinates('40°27′55″N 3°36′55″W')).toEqual({ lat: 40.46528, long: -3.61528 });
  });

  it('accepts ASCII marks, missing seconds and longitude first', () => {
    expect(parseCoordinates(`52°4'30"N 1°1'W`)).toEqual({ lat: 52.075, long: -1.01667 });
    expect(parseCoordinates('144°58′E 37°50′S')).toEqual({ lat: -37.83333, long: 144.96667 });
  });

  it('parses decimal pairs', () => {
    expect(parseCoordinates('-37.85, 144.97')).toEqual({ lat: -37.85, long: 144.97 });
    expect(parseCoordinates('25.958 -80.239')).toEqual({ lat: 25.958, long: -80.239 });
  });

  it('rejects missing, malformed and out-of-range values', () => {
    expect(parseCoordinates(null)).toBeNull();
    expect(parseCoordinates('')).toBeNull();
    expect(parseCoordinates('somewhere nice')).toBeNull();
    expect(parseCoordinates('37°50′59″S')).toBeNull();
    expect(parseCoordinates('37°N 38°N')).toBeNull();
    expect(parseCoordinates('91, 10')).toBeNull();
    expect(parseCoordinates('10, 181')).toBeNull();
    expect(parseCoordinates('1'.repeat(201))).toBeNull();
  });
});

describe('slimEvents', () => {
  it('keeps championship rounds and the fields the schedule needs', () => {
    const events = slimEvents([
      { intRound: '1', strEvent: '  Miami   Practice ', strTimestamp: '2026-05-01T13:30:00', dateEvent: '2026-05-01', idVenue: '23723', strVenue: 'Miami International Autodrome', strCountry: 'United States', strThumb: 'x' },
      { intRound: '500', strEvent: 'Testing Day 1', strTimestamp: '2026-02-11T10:00:00' },
      { intRound: '0', strEvent: 'Exhibition' },
      { intRound: '2', strEvent: '' },
      { intRound: '3', strEvent: 'No details', idVenue: '0' },
      null,
    ]);
    expect(events).toEqual([
      { round: 1, name: 'Miami Practice', timestamp: '2026-05-01T13:30:00', date: '2026-05-01', venueId: '23723', venue: 'Miami International Autodrome', country: 'United States' },
      { round: 3, name: 'No details', timestamp: null, date: null, venueId: null, venue: '', country: '' },
    ]);
  });

  it('returns an empty list for a missing events array', () => {
    expect(slimEvents(null)).toEqual([]);
  });
});

describe('slimVenue', () => {
  it('keeps the name, locality, country and parsed coordinates', () => {
    expect(slimVenue({ venues: [{ strVenue: 'Madring', strLocation: 'Madrid', strCountry: 'Spain', strMap: '40°27′55″N 3°36′55″W', strDescriptionEN: 'long' }] }))
      .toEqual({ name: 'Madring', locality: 'Madrid', country: 'Spain', coords: { lat: 40.46528, long: -3.61528 } });
  });

  it('tolerates missing fields and missing venues', () => {
    expect(slimVenue({ venues: [{ strMap: null }] })).toEqual({ name: '', locality: '', country: '', coords: null });
    expect(slimVenue({ venues: null })).toBeNull();
    expect(slimVenue(null)).toBeNull();
  });
});

describe('buildRace', () => {
  const venues = {
    '27574': { name: 'Albert Park Circuit', locality: 'Melbourne', country: 'Australia', coords: { lat: -37.85, long: 144.97 } },
  };

  it('derives sessions from the shared name prefix (F2-style rounds)', () => {
    const race = buildRace(1, [
      event('Australian Feature Race', '2026-03-08T00:25:00'),
      event('Australian Practice', '2026-03-05T23:00:00'),
      event('Australian Qualifying', '2026-03-06T03:55:00'),
      event('Australian Sprint Race', '2026-03-07T03:10:00', { venueId: null, venue: '' }),
    ], venues);

    expect(race).toEqual({
      round: '1',
      raceName: 'Australian',
      date: '2026-03-08',
      time: '00:25:00Z',
      Circuit: {
        circuitId: 'albert_park',
        circuitName: 'Albert Park Circuit',
        Location: { lat: '-37.85', long: '144.97', locality: 'Melbourne', country: 'Australia' },
      },
      sessions: [
        { id: 'practice', name: 'Practice', date: '2026-03-05', time: '23:00:00Z' },
        { id: 'qualifying', name: 'Qualifying', date: '2026-03-06', time: '03:55:00Z' },
        { id: 'sprint-race', name: 'Sprint Race', date: '2026-03-07', time: '03:10:00Z' },
        { id: 'feature-race', name: 'Feature Race', date: '2026-03-08', time: '00:25:00Z' },
      ],
    });
  });

  it('ignores accents when matching the prefix', () => {
    const race = buildRace(3, [
      event('Montreal Practice', '2026-05-22T14:05:00'),
      event('Montréal Feature Race', '2026-05-24T16:05:00'),
    ], {});
    expect(race.raceName).toBe('Montréal');
    expect(race.sessions.map(s => s.name)).toEqual(['Practice', 'Feature Race']);
  });

  it('uses the event named after the round as the race (Formula E)', () => {
    const race = buildRace(3, [
      event('Miami ePrix', '2026-01-31T19:05:00', { venueId: '23723' }),
      event('Miami ePrix Qualifying', '2026-01-31T14:40:00', { venueId: '23723' }),
    ], {}, { f1Layouts: false });
    expect(race.raceName).toBe('Miami ePrix');
    expect(race.time).toBe('19:05:00Z');
    expect(race.sessions.map(s => s.id)).toEqual(['qualifying', 'race']);
    // Formula E runs different layouts, so no F1 outline
    expect(race.Circuit.circuitId).toBeNull();
  });

  it('treats a single event as the race', () => {
    const race = buildRace(7, [event('Cook Out 400', '2026-03-29T19:30:00', { venueId: '99999', venue: 'Martinsville' })], {});
    expect(race.raceName).toBe('Cook Out 400');
    expect(race.sessions).toEqual([{ id: 'race', name: 'Race', date: '2026-03-29', time: '19:30:00Z' }]);
    expect(race.Circuit).toEqual({
      circuitId: null,
      circuitName: 'Martinsville',
      Location: { lat: '', long: '', locality: '', country: 'Australia' },
    });
  });

  it('gives repeated session names unique ids', () => {
    const race = buildRace(1, [
      event('Baku Practice', '2026-09-25T08:00:00'),
      event('Baku Practice', '2026-09-25T12:00:00'),
      event('Baku Race', '2026-09-26T12:00:00'),
    ], {});
    expect(race.sessions.map(s => s.id)).toEqual(['practice', 'practice-2', 'race']);
  });

  it('keeps date-only events and drops undated ones', () => {
    const race = buildRace(1, [
      { ...event('Rally Estonia', null), date: '2025-07-17' },
      { ...event('Rally Estonia Shakedown', null), date: null },
    ], {});
    expect(race.date).toBe('2025-07-17');
    expect(race).not.toHaveProperty('time');
    expect(race.sessions).toEqual([{ id: 'race', name: 'Race', date: '2025-07-17' }]);
  });

  it('returns null when no event has a date', () => {
    expect(buildRace(1, [{ ...event('Mystery', null), date: 'soon' }], {})).toBeNull();
  });

  it('picks the most common venue and falls back to event details without a lookup', () => {
    const race = buildRace(1, [
      event('X Practice', '2026-01-01T10:00:00', { venueId: '1', venue: '' }),
      event('X Qualifying', '2026-01-01T12:00:00', { venueId: '2', venue: 'Second Venue', country: '' }),
      event('X Race', '2026-01-02T12:00:00', { venueId: '2', venue: 'Second Venue', country: '' }),
    ], {});
    expect(race.Circuit.circuitName).toBe('Second Venue');
    expect(race.Circuit.Location.country).toBe('');
  });

  it('uses a slug fallback for labels without letters or digits', () => {
    const race = buildRace(1, [
      event('X !!!', '2026-01-01T10:00:00'),
      event('X Race', '2026-01-02T10:00:00'),
    ], {});
    expect(race.sessions[0].id).toBe('session');
  });
});
