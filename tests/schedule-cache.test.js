import { describe, it, expect } from 'vitest';
import {
    isEventDay, getScheduleCacheMs, SCHEDULE_CACHE_MS, EVENT_DAY_SCHEDULE_CACHE_MS
} from '../public/src/utils/schedule.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// "Now" is a session's own start, so the test holds in any time zone
const NOW = Date.parse('2026-11-07T11:40:00Z');

const SERIES_RACE = {
    round: '20', date: '2026-11-08', time: '16:00:00Z',
    sessions: [
        { id: 'qualifying-1', date: '2026-11-07', time: '11:40:00Z' },
        { id: 'gp', date: '2026-11-08', time: '16:00:00Z' },
    ],
};
const F1_RACE = {
    round: '22', date: '2026-11-08', time: '16:00:00Z',
    Circuit: { circuitId: 'losail' },
    FirstPractice: { date: '2026-11-06', time: '13:30:00Z' },
    Qualifying: { date: '2026-11-07', time: '11:40:00Z' },
};

describe('isEventDay', () => {
    it('spots a session today in Worker schedules and raw Ergast F1 races', () => {
        expect(isEventDay([SERIES_RACE], NOW)).toBe(true);
        expect(isEventDay([F1_RACE], NOW)).toBe(true);
        // The round's own date/time counts too
        expect(isEventDay([{ date: '2026-11-08', time: '16:00:00Z' }], Date.parse('2026-11-08T16:00:00Z'))).toBe(true);
    });

    it('is false away from the event and for unusable input', () => {
        expect(isEventDay([SERIES_RACE, F1_RACE], NOW - 3 * DAY)).toBe(false);
        expect(isEventDay([SERIES_RACE], NOW + 3 * DAY)).toBe(false);
        expect(isEventDay(null, NOW)).toBe(false);
        expect(isEventDay([null, { date: 42 }, { sessions: [null, {}] }], NOW)).toBe(false);
        expect(isEventDay([{ date: 'not a date' }], NOW)).toBe(false);
    });
});

describe('getScheduleCacheMs', () => {
    it('keeps a schedule a week, or an hour on the day of an event', () => {
        expect(getScheduleCacheMs([SERIES_RACE], NOW - 3 * DAY)).toBe(SCHEDULE_CACHE_MS);
        expect(getScheduleCacheMs([SERIES_RACE], NOW)).toBe(EVENT_DAY_SCHEDULE_CACHE_MS);
        expect(SCHEDULE_CACHE_MS).toBe(7 * DAY);
        expect(EVENT_DAY_SCHEDULE_CACHE_MS).toBe(HOUR);
    });
});
