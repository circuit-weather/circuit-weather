import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openF1ToErgastDateTime, transformOpenF1, fetchOpenF1Schedule } from '../public/src/api/openf1.js';

describe('openf1', () => {
    describe('openF1ToErgastDateTime', () => {
        it('converts a positive GMT offset to UTC', () => {
            // 15:00 local at UTC+3 → 12:00 UTC
            expect(openF1ToErgastDateTime('2026-03-22T15:00:00', '03:00:00')).toEqual({
                date: '2026-03-22',
                time: '12:00:00Z',
            });
        });

        it('converts a negative GMT offset to UTC', () => {
            // 14:00 local at UTC-5 → 19:00 UTC
            expect(openF1ToErgastDateTime('2026-10-19T14:00:00', '-05:00:00')).toEqual({
                date: '2026-10-19',
                time: '19:00:00Z',
            });
        });

        it('rolls over to the next day when offset crosses midnight', () => {
            // 23:00 local at UTC-5 → 04:00 UTC next day
            expect(openF1ToErgastDateTime('2026-10-19T23:00:00', '-05:00:00')).toEqual({
                date: '2026-10-20',
                time: '04:00:00Z',
            });
        });

        it('parses an ISO string that already carries its timezone offset', () => {
            // OpenF1 normally returns date_start with an embedded offset; gmt_offset is ignored.
            // 15:00 at +03:00 → 12:00 UTC
            expect(openF1ToErgastDateTime('2026-03-22T15:00:00+03:00', '03:00:00')).toEqual({
                date: '2026-03-22',
                time: '12:00:00Z',
            });
        });

        it('parses an ISO string with a trailing Z', () => {
            expect(openF1ToErgastDateTime('2026-03-22T12:00:00Z', null)).toEqual({
                date: '2026-03-22',
                time: '12:00:00Z',
            });
        });

        it('returns null when no timezone is embedded and no gmt_offset is given', () => {
            expect(openF1ToErgastDateTime('2026-03-22T15:00:00', null)).toBeNull();
        });

        it('returns null for an absent datetime', () => {
            expect(openF1ToErgastDateTime(null, '03:00:00')).toBeNull();
        });
    });

    describe('transformOpenF1', () => {
        const meetings = [
            {
                meeting_key: 2,
                meeting_name: 'Saudi Arabian Grand Prix',
                circuit_short_name: 'Jeddah',
                location: 'Jeddah',
                country_name: 'Saudi Arabia',
                date_start: '2026-04-17T13:30:00',
            },
            {
                meeting_key: 1,
                meeting_name: 'Bahrain Grand Prix',
                circuit_short_name: 'Sakhir',
                location: 'Sakhir',
                country_name: 'Bahrain',
                date_start: '2026-03-20T11:30:00',
            },
            {
                // Pre-season testing — no Race session, must be filtered out
                meeting_key: 99,
                meeting_name: 'Pre-Season Testing',
                circuit_short_name: 'Sakhir',
                location: 'Sakhir',
                country_name: 'Bahrain',
                date_start: '2026-02-26T07:00:00',
            },
        ];
        const sessions = [
            { meeting_key: 1, session_type: 'Practice 1', date_start: '2026-03-20T11:30:00', gmt_offset: '03:00:00' },
            { meeting_key: 1, session_type: 'Qualifying', date_start: '2026-03-21T15:00:00', gmt_offset: '03:00:00' },
            { meeting_key: 1, session_type: 'Race',       date_start: '2026-03-22T15:00:00', gmt_offset: '03:00:00' },
            { meeting_key: 2, session_type: 'Race',       date_start: '2026-04-19T17:00:00', gmt_offset: '03:00:00' },
            { meeting_key: 99, session_type: 'Practice 1', date_start: '2026-02-26T07:00:00', gmt_offset: '03:00:00' },
        ];

        it('filters out non-race meetings and sorts by date', () => {
            const races = transformOpenF1(meetings, sessions);

            expect(races).toHaveLength(2);
            // Sorted chronologically: Bahrain (round 1) before Saudi (round 2)
            expect(races[0].raceName).toBe('Bahrain Grand Prix');
            expect(races[0].round).toBe('1');
            expect(races[1].raceName).toBe('Saudi Arabian Grand Prix');
            expect(races[1].round).toBe('2');
        });

        it('maps circuit_short_name to the Ergast circuitId', () => {
            const races = transformOpenF1(meetings, sessions);
            expect(races[0].Circuit.circuitId).toBe('bahrain');
            expect(races[1].Circuit.circuitId).toBe('jeddah');
        });

        it('produces Ergast-shaped session fields with UTC times', () => {
            const races = transformOpenF1(meetings, sessions);
            const bahrain = races[0];
            expect(bahrain.FirstPractice).toEqual({ date: '2026-03-20', time: '08:30:00Z' });
            expect(bahrain.Qualifying).toEqual({ date: '2026-03-21', time: '12:00:00Z' });
            expect(bahrain.date).toBe('2026-03-22');
            expect(bahrain.time).toBe('12:00:00Z');
        });

        it('skips sessions with null date_start or gmt_offset', () => {
            const mtgs = [{ meeting_key: 3, meeting_name: 'Test GP', circuit_short_name: 'Sakhir', location: 'Sakhir', country_name: 'Bahrain', date_start: '2026-05-01T12:00:00' }];
            const sess = [
                { meeting_key: 3, session_type: 'Practice 1', date_start: null, gmt_offset: '03:00:00' },
                { meeting_key: 3, session_type: 'Qualifying', date_start: '2026-05-02T15:00:00', gmt_offset: null },
                { meeting_key: 3, session_type: 'Race', date_start: '2026-05-03T15:00:00', gmt_offset: '03:00:00' },
            ];
            const races = transformOpenF1(mtgs, sess);
            expect(races).toHaveLength(1);
            expect(races[0].FirstPractice).toBeUndefined();
            expect(races[0].Qualifying).toBeUndefined();
            expect(races[0].date).toBe('2026-05-03');
        });

        it('leaves circuitId null for an unknown circuit', () => {
            const unknown = [{ meeting_key: 5, meeting_name: 'Mystery GP', circuit_short_name: 'Atlantis', date_start: '2026-05-01T12:00:00' }];
            const unknownSessions = [{ meeting_key: 5, session_type: 'Race', date_start: '2026-05-01T12:00:00', gmt_offset: '00:00:00' }];
            const races = transformOpenF1(unknown, unknownSessions);
            expect(races[0].Circuit.circuitId).toBeNull();
        });
    });

    describe('fetchOpenF1Schedule', () => {
        let mockFetch;

        beforeEach(() => {
            mockFetch = vi.fn();
            vi.stubGlobal('fetch', mockFetch);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('fetches meetings + sessions and returns transformed races', async () => {
            const meetings = [{ meeting_key: 1, meeting_name: 'Bahrain Grand Prix', circuit_short_name: 'Sakhir', location: 'Sakhir', country_name: 'Bahrain', date_start: '2026-03-20T11:30:00' }];
            const sessions = [{ meeting_key: 1, session_type: 'Race', date_start: '2026-03-22T15:00:00', gmt_offset: '03:00:00' }];

            mockFetch
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(meetings) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(sessions) });

            const races = await fetchOpenF1Schedule();

            expect(races).toHaveLength(1);
            expect(races[0].Circuit.circuitId).toBe('bahrain');
            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch.mock.calls[0][0]).toContain('api.openf1.org/v1/meetings');
            expect(mockFetch.mock.calls[1][0]).toContain('api.openf1.org/v1/sessions');
        });

        it('throws when either OpenF1 endpoint returns non-OK', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 403, json: () => Promise.resolve([]) })
                .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) });

            await expect(fetchOpenF1Schedule()).rejects.toThrow('OpenF1 error');
        });
    });
});
