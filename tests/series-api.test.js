import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SeriesAPI } from '../public/src/api/SeriesAPI.js';
import { SafeStorage } from '../public/src/utils/storage.js';

const RACE = {
    round: '13',
    raceName: 'Qatar',
    date: '2026-11-29',
    time: '13:00:00Z',
    Circuit: { circuitId: 'losail', circuitName: 'Lusail', Location: { lat: '25.49', long: '51.45', country: 'Qatar' } },
    sessions: [
        { id: 'sprint-race', name: 'Sprint Race', date: '2026-11-28', time: '13:00:00Z' },
        { id: 'feature-race', name: 'Feature Race', date: '2026-11-29', time: '13:00:00Z' },
    ],
};

describe('SeriesAPI', () => {
    let api;
    let store;
    let mockFetch;

    beforeEach(() => {
        api = new SeriesAPI();
        store = {};
        vi.spyOn(SafeStorage, 'getItem').mockImplementation(key => store[key] ?? null);
        vi.spyOn(SafeStorage, 'setItem').mockImplementation((key, value) => { store[key] = value; });
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        // RACE is in November 2026: keep it upcoming
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.parse('2026-10-31T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    const respond = (body, status = 200) => mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
    const stored = () => JSON.parse(store.series_schedule_cache);

    it('fetches the series from the Worker and caches it', async () => {
        respond({ series: 'f2', complete: true, races: [RACE] });

        const schedule = await api.getSchedule('f2');
        expect(schedule).toEqual({ races: [RACE], complete: true });
        expect(mockFetch.mock.calls[0][0]).toBe('/api/schedule/f2');
        expect(stored().f2).toMatchObject({ races: [RACE], complete: true });

        // Memory cache
        expect(await api.getSchedule('f2')).toBe(schedule);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('keeps each series separately', async () => {
        respond({ complete: true, races: [RACE] });
        respond({ complete: false, races: [] });
        await api.getSchedule('f2');
        await api.getSchedule('fe');
        expect(Object.keys(stored())).toEqual(['f2', 'fe']);
    });

    it('uses a stored complete schedule for a week', async () => {
        store.series_schedule_cache = JSON.stringify({ f2: { timestamp: Date.now() - 6 * 24 * 3600 * 1000, races: [RACE], complete: true } });
        expect((await api.getSchedule('f2')).races).toEqual([RACE]);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('only uses a stored complete schedule for an hour on the day of an event', async () => {
        // The sprint race's own start, so it is "today" in any time zone
        vi.setSystemTime(Date.parse('2026-11-28T13:00:00Z'));
        store.series_schedule_cache = JSON.stringify({ f2: { timestamp: Date.now() - 30 * 60 * 1000, races: [RACE], complete: true } });
        expect((await api.getSchedule('f2')).races).toEqual([RACE]);
        expect(mockFetch).not.toHaveBeenCalled();

        api = new SeriesAPI();
        const moved = { ...RACE, time: '14:00:00Z' };
        store.series_schedule_cache = JSON.stringify({ f2: { timestamp: Date.now() - 2 * 60 * 60 * 1000, races: [RACE], complete: true } });
        respond({ complete: true, races: [moved] });
        expect((await api.getSchedule('f2')).races).toEqual([moved]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('re-fetches a stored schedule once its season is over', async () => {
        vi.setSystemTime(Date.parse('2026-12-01T00:00:00Z'));
        store.series_schedule_cache = JSON.stringify({ f2: { timestamp: Date.now() - 24 * 3600 * 1000, races: [RACE], complete: true } });
        const opener = { ...RACE, round: '1', date: '2027-03-07' };
        respond({ complete: true, races: [opener] });
        expect((await api.getSchedule('f2')).races).toEqual([opener]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('only uses a stored partial schedule for a few minutes', async () => {
        store.series_schedule_cache = JSON.stringify({ f2: { timestamp: Date.now() - 10 * 60 * 1000, races: [], complete: false } });
        respond({ complete: true, races: [RACE] });
        expect((await api.getSchedule('f2')).complete).toBe(true);
        expect(mockFetch).toHaveBeenCalled();
    });

    it('refresh bypasses both caches', async () => {
        respond({ complete: false, races: [] });
        await api.getSchedule('f2');
        respond({ complete: true, races: [RACE] });
        expect((await api.getSchedule('f2', { refresh: true })).complete).toBe(true);
    });

    it('falls back to an expired stored schedule when the fetch fails', async () => {
        store.series_schedule_cache = JSON.stringify({ f3: { timestamp: 0, races: [RACE], complete: true } });
        respond({ error: {} }, 503);
        expect((await api.getSchedule('f3')).races).toEqual([RACE]);
    });

    it('throws when nothing is available', async () => {
        respond({ error: {} }, 503);
        await expect(api.getSchedule('fe')).rejects.toThrow('SERIES_SCHEDULE_UNAVAILABLE:fe');
    });

    it('rejects malformed responses', async () => {
        respond({ races: 'nope' });
        await expect(api.getSchedule('f2')).rejects.toThrow('SERIES_SCHEDULE_UNAVAILABLE:f2');
    });

    it('ignores poisoned or unreadable storage', async () => {
        store.series_schedule_cache = JSON.stringify({ f2: { timestamp: Date.now(), races: 'x' } });
        respond({ complete: true, races: [RACE] });
        expect((await api.getSchedule('f2')).races).toEqual([RACE]);

        api = new SeriesAPI();
        store.series_schedule_cache = '{not json';
        respond({ complete: true, races: [] });
        expect((await api.getSchedule('f2')).races).toEqual([]);

        api = new SeriesAPI();
        store.series_schedule_cache = '[1,2]';
        respond({ complete: true, races: [] });
        await api.getSchedule('f2');
        expect(stored()).toHaveProperty('f2');
    });

    it('treats a missing complete flag as partial', async () => {
        respond({ races: [RACE] });
        expect((await api.getSchedule('f2')).complete).toBe(false);
    });

    describe('parseRace', () => {
        it('maps the Worker race to the app race shape', () => {
            expect(api.parseRace(RACE)).toEqual({
                round: '13',
                name: 'Qatar',
                circuit: RACE.Circuit,
                location: RACE.Circuit.Location,
                sessions: RACE.sessions,
                date: '2026-11-29',
                time: '13:00:00Z',
            });
        });

        it('drops malformed sessions', () => {
            const race = api.parseRace({ ...RACE, sessions: [null, { id: 1, name: 'x' }, RACE.sessions[0]] });
            expect(race.sessions).toEqual([RACE.sessions[0]]);
            expect(api.parseRace({ round: '1' }).sessions).toEqual([]);
        });
    });
});
