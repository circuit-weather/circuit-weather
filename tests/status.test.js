import { describe, it, expect } from 'vitest';
import { getSessionStatus, getRoundStatus, formatStatusLabel } from '../public/src/utils/status.js';

describe('status utils', () => {
    describe('getSessionStatus', () => {
        it('identifies LIVE session', () => {
            const now = new Date('2023-03-05T15:30:00Z');
            const session = { id: 'race', date: '2023-03-05', time: '15:00:00Z' };
            expect(getSessionStatus(session, now)).toBe('LIVE');
        });

        it('identifies FUTURE session', () => {
            const now = new Date('2023-03-05T14:59:00Z');
            const session = { id: 'race', date: '2023-03-05', time: '15:00:00Z' };
            expect(getSessionStatus(session, now)).toBe('FUTURE');
        });

        it('identifies PAST session', () => {
            const now = new Date('2023-03-05T18:01:00Z');
            const session = { id: 'race', date: '2023-03-05', time: '15:00:00Z' };
            // Race duration is assumed 3h, so 15:00 + 3h = 18:00
            expect(getSessionStatus(session, now)).toBe('PAST');
        });

        it('handles non-race sessions (2h duration)', () => {
            const session = { id: 'fp1', date: '2023-03-03', time: '10:00:00Z' };
            const live = new Date('2023-03-03T11:59:00Z');
            const past = new Date('2023-03-03T12:01:00Z');

            expect(getSessionStatus(session, live)).toBe('LIVE');
            expect(getSessionStatus(session, past)).toBe('PAST');
        });

        it('returns UNKNOWN for invalid inputs', () => {
            const now = new Date();
            expect(getSessionStatus(null, now)).toBe('UNKNOWN');
            expect(getSessionStatus({}, now)).toBe('UNKNOWN');
            expect(getSessionStatus({ date: '2023-03-05' }, now)).toBe('UNKNOWN');
            expect(getSessionStatus({ time: '15:00:00Z' }, now)).toBe('UNKNOWN');
        });
    });

    describe('getRoundStatus', () => {
        const race = {
            sessions: [
                { id: 'fp1', date: '2023-03-03', time: '10:00:00Z' },
                { id: 'race', date: '2023-03-05', time: '15:00:00Z' }
            ]
        };

        it('identifies LIVE round during session', () => {
            const now = new Date('2023-03-03T11:00:00Z'); // During FP1
            expect(getRoundStatus(race, now)).toBe('LIVE');
        });

        it('identifies CURRENT round between sessions', () => {
            const now = new Date('2023-03-04T12:00:00Z'); // Between FP1 and Race
            expect(getRoundStatus(race, now)).toBe('CURRENT');
        });

        it('identifies FUTURE round', () => {
            const now = new Date('2023-03-03T09:59:00Z');
            expect(getRoundStatus(race, now)).toBe('FUTURE');
        });

        it('identifies PAST round', () => {
            const now = new Date('2023-03-05T19:01:00Z'); // Race ends at 15:00 + 4h = 19:00
            expect(getRoundStatus(race, now)).toBe('PAST');
        });

        it('returns UNKNOWN for invalid inputs', () => {
            const now = new Date();
            expect(getRoundStatus(null, now)).toBe('UNKNOWN');
            expect(getRoundStatus({}, now)).toBe('UNKNOWN');
            expect(getRoundStatus({ sessions: [] }, now)).toBe('UNKNOWN');
        });

        it('handles malformed sessions in round', () => {
            const now = new Date();
            const raceWithBadSessions = {
                sessions: [
                    { id: 'bad1' }, // Missing date/time
                    { id: 'bad2', date: '2023-03-05' } // Missing time
                ]
            };
            expect(getRoundStatus(raceWithBadSessions, now)).toBe('UNKNOWN');
        });

        it('evaluates exact start and end boundaries for session and round status', () => {
            // Race starts at 15:00:00Z and ends at 19:00:00Z (15:00 + 4h duration for race in round status)
            const exactStart = new Date('2023-03-05T15:00:00Z');
            const exactEnd = new Date('2023-03-05T19:00:00Z');
            const oneSecondAfterEnd = new Date('2023-03-05T19:00:01Z');
            const oneSecondBeforeStart = new Date('2023-03-05T14:59:59Z');

            expect(getRoundStatus(race, exactStart)).toBe('LIVE');
            expect(getRoundStatus(race, exactEnd)).toBe('LIVE');
            expect(getRoundStatus(race, oneSecondAfterEnd)).toBe('PAST');
            expect(getRoundStatus(race, oneSecondBeforeStart)).toBe('CURRENT');
        });

        it('handles unordered sessions and calculates minStart and maxEnd correctly', () => {
            const unorderedRace = {
                sessions: [
                    { id: 'race', date: '2023-03-05', time: '15:00:00Z' },
                    { id: 'fp1', date: '2023-03-03', time: '10:00:00Z' }
                ]
            };

            const beforeAll = new Date('2023-03-03T09:59:59Z');
            const betweenSessions = new Date('2023-03-04T12:00:00Z');
            const afterAll = new Date('2023-03-05T19:00:01Z');

            expect(getRoundStatus(unorderedRace, beforeAll)).toBe('FUTURE');
            expect(getRoundStatus(unorderedRace, betweenSessions)).toBe('CURRENT');
            expect(getRoundStatus(unorderedRace, afterAll)).toBe('PAST');
        });

        it('skips malformed sessions while correctly processing valid sessions', () => {
            const mixedRace = {
                sessions: [
                    { id: 'bad1' },
                    { id: 'fp1', date: '2023-03-03', time: '10:00:00Z' },
                    { id: 'bad2', date: '2023-03-05' }
                ]
            };

            const duringFp1 = new Date('2023-03-03T11:00:00Z');
            const afterFp1 = new Date('2023-03-03T12:00:01Z');

            expect(getRoundStatus(mixedRace, duringFp1)).toBe('LIVE');
            expect(getRoundStatus(mixedRace, afterFp1)).toBe('PAST');
        });

        it('applies 4-hour duration specifically for race session in getRoundStatus', () => {
            const raceOnly = {
                sessions: [
                    { id: 'race', date: '2023-03-05', time: '15:00:00Z' }
                ]
            };

            // 3 hours after start (18:00) -> Still LIVE for race round (4h duration)
            const threeHoursIn = new Date('2023-03-05T18:00:00Z');
            // Exactly 4 hours after start (19:00) -> LIVE
            const fourHoursIn = new Date('2023-03-05T19:00:00Z');
            // Just after 4 hours -> PAST
            const pastFourHours = new Date('2023-03-05T19:00:01Z');

            expect(getRoundStatus(raceOnly, threeHoursIn)).toBe('LIVE');
            expect(getRoundStatus(raceOnly, fourHoursIn)).toBe('LIVE');
            expect(getRoundStatus(raceOnly, pastFourHours)).toBe('PAST');
        });
    });

    describe('formatStatusLabel', () => {
        it('formats LIVE correctly', () => {
            expect(formatStatusLabel('Round 1', 'LIVE', false)).toBe('🔴 LIVE Round 1');
            expect(formatStatusLabel('Round 1', 'LIVE', true)).toBe('🔴 LIVE Round 1');
        });

        it('formats CURRENT correctly', () => {
            expect(formatStatusLabel('Round 1', 'CURRENT', false)).toBe('(Current) Round 1');
        });

        it('formats NEXT correctly', () => {
            expect(formatStatusLabel('Round 2', 'FUTURE', true)).toBe('(Next) Round 2');
        });

        it('formats others correctly', () => {
            expect(formatStatusLabel('Round 3', 'FUTURE', false)).toBe('Round 3');
            expect(formatStatusLabel('Round 0', 'PAST', false)).toBe('Round 0');
        });
    });
});
