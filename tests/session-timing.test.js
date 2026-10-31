import { describe, it, expect } from 'vitest';
import {
    sessionStart, isMainRace, sessionEnd, sessionStatus, roundEnd, roundStatus,
    sessionsByStart, findCurrentSession, findNextSession,
    SESSION_HOLD_MS, RACE_HOLD_MS, ENDURANCE_RACE_HOLD_MS,
} from '../public/src/utils/sessionTiming.js';

const H = 60 * 60 * 1000;
const at = (iso) => new Date(iso);
const s = (id, iso) => ({ id, name: id, date: iso.slice(0, 10), time: `${iso.slice(11, 16)}:00Z` });

// MotoGP, Sepang 2026 (TheSportsDB): qualifying and practice minutes apart; the GP is 'gp'
const sepang = {
    round: '19', date: '2026-11-01', time: '08:00:00Z',
    sessions: [
        s('free-practice-1', '2026-10-30T03:45'),
        s('practice', '2026-10-30T08:00'),
        s('qualifying-1', '2026-10-31T02:50'),
        s('free-practice-2', '2026-10-31T03:10'),
        s('qualifying-2', '2026-10-31T03:15'),
        s('sprint-race', '2026-10-31T08:00'),
        s('gp', '2026-11-01T08:00'),
    ],
};
const portimao = {
    round: '20', date: '2026-11-15', time: '13:00:00Z',
    sessions: [s('free-practice-1', '2026-11-13T09:45'), s('gp', '2026-11-15T13:00')],
};

// WEC, 6 Hours of Monza 2026, listed out of start order like TheSportsDB does
const monza = {
    round: '8', date: '2026-11-08', time: '10:00:00Z',
    sessions: [
        s('free-practice-1', '2026-11-06T09:30'),
        s('qualifying-hypercar', '2026-11-07T14:00'),
        s('qualifying-lmgt3', '2026-11-07T13:20'),
        s('hyperpole-lmgt3', '2026-11-07T13:40'),
        s('hyperpole-hypercar', '2026-11-07T14:20'),
        s('race', '2026-11-08T10:00'),
    ],
};

describe('sessionStart / sessionsByStart', () => {
    it('reads the start time, NaN without one', () => {
        expect(sessionStart(s('fp1', '2026-11-06T09:30'))).toBe(Date.parse('2026-11-06T09:30:00Z'));
        expect(sessionStart({ id: 'x' })).toBeNaN();
        expect(sessionStart(null)).toBeNaN();
    });

    it('orders a round by start and drops sessions without a time', () => {
        const ids = sessionsByStart({ sessions: [...monza.sessions, { id: 'tbc' }] }).map(x => x.id);
        expect(ids).toEqual(['free-practice-1', 'qualifying-lmgt3', 'hyperpole-lmgt3', 'qualifying-hypercar', 'hyperpole-hypercar', 'race']);
    });
});

describe('isMainRace', () => {
    it('is the session called race, else the one at the round time', () => {
        expect(isMainRace(monza, monza.sessions[5])).toBe(true);
        expect(isMainRace(sepang, sepang.sessions[6])).toBe(true); // MotoGP 'gp'
        expect(isMainRace(sepang, sepang.sessions[5])).toBe(false); // sprint
        const f2 = { date: '2026-11-29', time: '13:00:00Z', sessions: [s('sprint-race', '2026-11-28T13:00'), s('feature-race', '2026-11-29T13:00')] };
        expect(isMainRace(f2, f2.sessions[1])).toBe(true);
        expect(isMainRace(f2, f2.sessions[0])).toBe(false);
        // A 'race' session elsewhere in the round wins over the round time
        const both = { date: '2026-11-29', time: '13:00:00Z', sessions: [s('race', '2026-11-29T15:00'), s('other', '2026-11-29T13:00')] };
        expect(isMainRace(both, both.sessions[1])).toBe(false);
        expect(isMainRace({ date: 'TBC', sessions: [] }, s('x', '2026-11-29T13:00'))).toBe(false);
    });
});

describe('sessionEnd', () => {
    it('holds a session 1 h 30 min, or until the next one starts', () => {
        const [, practice, q1, fp2, q2, sprint] = sepang.sessions;
        expect(sessionEnd(sepang, practice, 'motogp')).toBe(sessionStart(practice) + SESSION_HOLD_MS);
        expect(sessionEnd(sepang, q1, 'motogp')).toBe(sessionStart(fp2)); // 20 min later
        expect(sessionEnd(sepang, fp2, 'motogp')).toBe(sessionStart(q2)); // 5 min later
        expect(sessionEnd(sepang, q2, 'motogp')).toBe(sessionStart(q2) + SESSION_HOLD_MS);
        expect(sessionEnd(sepang, sprint, 'motogp')).toBe(sessionStart(sprint) + SESSION_HOLD_MS);
    });

    it('holds a main race 4 h, and 25 h in WEC and IMSA', () => {
        expect(sessionEnd(sepang, sepang.sessions[6], 'motogp')).toBe(Date.parse('2026-11-01T08:00:00Z') + RACE_HOLD_MS);
        expect(sessionEnd(monza, monza.sessions[5], 'wec')).toBe(Date.parse('2026-11-08T10:00:00Z') + ENDURANCE_RACE_HOLD_MS);
        const daytona = { date: '2026-01-24', time: '18:40:00Z', sessions: [s('race', '2026-01-24T18:40')] };
        expect(sessionEnd(daytona, daytona.sessions[0], 'imsa') - sessionStart(daytona.sessions[0])).toBe(25 * H);
    });

    it('is NaN without a start time', () => {
        expect(sessionEnd(sepang, { id: 'tbc' }, 'motogp')).toBeNaN();
    });
});

describe('sessionStatus / roundStatus', () => {
    it('marks sessions future, live and past', () => {
        const q1 = sepang.sessions[2];
        expect(sessionStatus(sepang, q1, 'motogp', at('2026-10-31T02:49:00Z'))).toBe('FUTURE');
        expect(sessionStatus(sepang, q1, 'motogp', at('2026-10-31T02:50:00Z'))).toBe('LIVE');
        expect(sessionStatus(sepang, q1, 'motogp', at('2026-10-31T03:10:00Z'))).toBe('PAST');
        expect(sessionStatus(sepang, { id: 'tbc' }, 'motogp', at('2026-10-31T03:10:00Z'))).toBe('UNKNOWN');
    });

    it('marks rounds future, live, current between sessions, and past', () => {
        expect(roundStatus(sepang, 'motogp', at('2026-10-29T00:00:00Z'))).toBe('FUTURE');
        expect(roundStatus(sepang, 'motogp', at('2026-10-31T03:20:00Z'))).toBe('LIVE');
        expect(roundStatus(sepang, 'motogp', at('2026-10-31T06:00:00Z'))).toBe('CURRENT');
        expect(roundStatus(sepang, 'motogp', at('2026-11-01T12:00:00Z'))).toBe('PAST');
        expect(roundStatus({ sessions: [{ id: 'tbc' }] }, 'motogp', at('2026-11-01T12:00:00Z'))).toBe('UNKNOWN');
        expect(roundStatus(null, 'motogp', at('2026-11-01T12:00:00Z'))).toBe('UNKNOWN');
    });

    it('ends a round with its last session, or the race time when no session has one', () => {
        expect(roundEnd(monza, 'wec')).toBe(Date.parse('2026-11-08T10:00:00Z') + 25 * H);
        const untimed = { date: '2026-11-29', time: '13:00:00Z', sessions: [{ id: 'race' }] };
        expect(roundEnd(untimed, 'f2')).toBe(Date.parse('2026-11-29T13:00:00Z') + 4 * H);
    });
});

describe('findCurrentSession', () => {
    const races = [sepang, portimao];
    const pick = (iso) => {
        const current = findCurrentSession(races, at(iso), 'motogp');
        return current && `${current.race.round}/${current.session?.id}`;
    };

    it('steps through the Sepang weekend as planned', () => {
        expect(pick('2026-10-31T02:00:00Z')).toBe('19/qualifying-1'); // next up
        expect(pick('2026-10-31T02:55:00Z')).toBe('19/qualifying-1');
        expect(pick('2026-10-31T03:10:00Z')).toBe('19/free-practice-2');
        expect(pick('2026-10-31T03:15:00Z')).toBe('19/qualifying-2');
        expect(pick('2026-10-31T04:44:00Z')).toBe('19/qualifying-2');
        expect(pick('2026-10-31T04:45:00Z')).toBe('19/sprint-race');
        expect(pick('2026-10-31T09:30:00Z')).toBe('19/gp');
        expect(pick('2026-11-01T11:59:00Z')).toBe('19/gp');
        // Four hours after the GP: on to the next round
        expect(pick('2026-11-01T12:00:00Z')).toBe('20/free-practice-1');
    });

    it('keeps a WEC race up for 25 hours', () => {
        const next = { round: '9', date: '2026-11-28', time: '10:00:00Z', sessions: [s('free-practice-1', '2026-11-26T09:30')] };
        const current = (iso) => findCurrentSession([monza, next], at(iso), 'wec').race.round;
        expect(current('2026-11-08T16:30:00Z')).toBe('8'); // race over, held
        expect(current('2026-11-09T10:59:00Z')).toBe('8');
        expect(current('2026-11-09T11:00:00Z')).toBe('9');
    });

    it('returns the round without a session when it lists no times, and null after the season', () => {
        const untimed = { round: '1', date: '2026-12-01', time: '13:00:00Z', sessions: [{ id: 'race' }] };
        expect(findCurrentSession([untimed], at('2026-11-01T00:00:00Z'), 'f2')).toEqual({ race: untimed, session: null });
        expect(findCurrentSession(races, at('2026-12-31T00:00:00Z'), 'motogp')).toBeNull();
        expect(findCurrentSession(undefined, at('2026-12-31T00:00:00Z'), 'motogp')).toBeNull();
    });
});

describe('findNextSession', () => {
    it('finds the next session to start, across rounds', () => {
        expect(findNextSession([sepang, portimao], at('2026-10-31T03:12:00Z'), 'motogp')).toEqual({ round: '19', sessionId: 'qualifying-2' });
        expect(findNextSession([sepang, portimao], at('2026-11-01T09:00:00Z'), 'motogp')).toEqual({ round: '20', sessionId: 'free-practice-1' });
        expect(findNextSession([sepang], at('2026-12-01T00:00:00Z'), 'motogp')).toBeNull();
        expect(findNextSession(null, at('2026-12-01T00:00:00Z'), 'motogp')).toBeNull();
    });
});
