import { getRaceEndTime } from './schedule.js';

/**
 * When sessions count as live and finished.
 *
 * Schedules give start times only, so each session is held for an assumed
 * length from its start, cut short when the next session in the round starts
 * (MotoGP and WEC run qualifying sessions 5-20 minutes apart). This one rule
 * drives the automatic selection on page load, the LIVE/Next markers in the
 * dropdowns and auto-advance, so they always agree.
 */

const HOUR_MS = 60 * 60 * 1000;

// Practice, qualifying, Hyperpole, sprints: F1 practice and qualifying run 60
// minutes, MotoGP sessions 15-45; the rest allows for red flags and delays
export const SESSION_HOLD_MS = 1.5 * HOUR_MS;
// A round's main race: F1 caps a race at 3 hours including suspensions, plus
// the podium and post-race
export const RACE_HOLD_MS = 4 * HOUR_MS;
// Endurance races run up to 24 hours (Le Mans, Daytona); shorter ones just
// stay on screen longer, with the next round weeks away
export const ENDURANCE_RACE_HOLD_MS = 25 * HOUR_MS;
export const ENDURANCE_SERIES = Object.freeze(['wec', 'imsa']);

/** @returns {number} Start time in ms, or NaN without a usable date and time */
export function sessionStart(session) {
    if (!session?.date || !session?.time) return NaN;
    return new Date(`${session.date}T${session.time}`).getTime();
}

/**
 * The round's main race: the session called 'race', else the one starting at
 * the round's own date and time (MotoGP's 'gp', the F2/F3 Feature Race).
 */
export function isMainRace(race, session) {
    if (session.id === 'race') return true;
    if (race.sessions?.some(s => s.id === 'race')) return false;
    const roundStart = new Date(`${race.date}T${race.time}`).getTime();
    return Number.isFinite(roundStart) && sessionStart(session) === roundStart;
}

function holdMs(race, session, series) {
    if (!isMainRace(race, session)) return SESSION_HOLD_MS;
    return ENDURANCE_SERIES.includes(series) ? ENDURANCE_RACE_HOLD_MS : RACE_HOLD_MS;
}

/**
 * When a session counts as finished: its assumed length after the start, or
 * the next session's start in the same round if that comes first.
 * @returns {number} ms, or NaN without a start time
 */
export function sessionEnd(race, session, series) {
    const start = sessionStart(session);
    if (!Number.isFinite(start)) return NaN;
    let end = start + holdMs(race, session, series);
    for (const other of race.sessions || []) {
        const otherStart = sessionStart(other);
        if (otherStart > start && otherStart < end) end = otherStart;
    }
    return end;
}

/** @returns {'LIVE'|'FUTURE'|'PAST'|'UNKNOWN'} */
export function sessionStatus(race, session, series, now) {
    const start = sessionStart(session);
    if (!Number.isFinite(start)) return 'UNKNOWN';
    const t = now.getTime();
    if (t < start) return 'FUTURE';
    return t < sessionEnd(race, session, series) ? 'LIVE' : 'PAST';
}

/** When a round is over: its last session's end (or the old race-time fallback). */
export function roundEnd(race, series) {
    const ends = (race.sessions || []).map(s => sessionEnd(race, s, series)).filter(Number.isFinite);
    return ends.length ? Math.max(...ends) : getRaceEndTime(race).getTime();
}

/**
 * @returns {'LIVE'|'CURRENT'|'FUTURE'|'PAST'|'UNKNOWN'} CURRENT: between sessions mid-weekend
 */
export function roundStatus(race, series, now) {
    const sessions = race?.sessions || [];
    const starts = sessions.map(sessionStart).filter(Number.isFinite);
    if (starts.length === 0) return 'UNKNOWN';
    if (sessions.some(s => sessionStatus(race, s, series, now) === 'LIVE')) return 'LIVE';
    const t = now.getTime();
    if (t < Math.min(...starts)) return 'FUTURE';
    return t < roundEnd(race, series) ? 'CURRENT' : 'PAST';
}

/** A round's sessions in start order (schedules don't always list them that way). */
export function sessionsByStart(race) {
    return [...(race.sessions || [])]
        .filter(s => Number.isFinite(sessionStart(s)))
        .sort((a, b) => sessionStart(a) - sessionStart(b));
}

/**
 * What to show now: the live session, else the next one, in the first round
 * that isn't over. Rounds are in date order.
 * @returns {{race: Object, session: Object|null}|null} session is null when the
 *   round lists no session times
 */
export function findCurrentSession(races, now, series) {
    const t = now.getTime();
    for (const race of races || []) {
        if (!(roundEnd(race, series) > t)) continue;
        const session = sessionsByStart(race).find(s => sessionEnd(race, s, series) > t) || null;
        return { race, session };
    }
    return null;
}

/**
 * The next session to start, across the season.
 * @returns {{round: string, sessionId: string}|null}
 */
export function findNextSession(races, now, series) {
    const t = now.getTime();
    for (const race of races || []) {
        if (!(roundEnd(race, series) > t)) continue;
        const session = sessionsByStart(race).find(s => sessionStart(s) > t);
        if (session) return { round: race.round, sessionId: session.id };
    }
    return null;
}
