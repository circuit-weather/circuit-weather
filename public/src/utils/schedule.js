import { CONFIG } from '../config.js';

/**
 * Whether every round of a schedule has finished, so its season is over and the
 * next round (if any) is in next season's schedule. Works on raw Ergast-shaped
 * races as well as parsed ones.
 * @param {Array} races
 * @param {number} [now]
 */
export function isScheduleOver(races, now = Date.now()) {
    return Array.isArray(races) && races.length > 0 && races.every(r => getRaceEndTime(r).getTime() <= now);
}

// How long a saved complete schedule is used before it is fetched again: a week
// normally, an hour on the day of an event (session times can still move then).
// public/theme.js repeats these rules in ES5; keep the two in step.
export const SCHEDULE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const EVENT_DAY_SCHEDULE_CACHE_MS = 60 * 60 * 1000;

/**
 * Whether any session of a schedule starts today (the visitor's local date).
 * Works on raw schedules as saved: Ergast F1 races (FirstPractice, Sprint, ...
 * as { date, time } objects) and the Worker's races with a `sessions` array.
 * @param {Array} races
 * @param {number} [now]
 */
export function isEventDay(races, now = Date.now()) {
    if (!Array.isArray(races)) return false;
    const today = new Date(now).toDateString();
    const startsToday = (s) => {
        if (!s || typeof s.date !== 'string') return false;
        const start = new Date(s.time ? `${s.date}T${s.time}` : `${s.date}T12:00:00Z`);
        return start.toDateString() === today;
    };
    return races.some(race => race && (
        startsToday(race) ||
        Object.values(race).some(v => (Array.isArray(v) ? v.some(startsToday) : startsToday(v)))
    ));
}

/**
 * How long a saved complete schedule stays fresh.
 * @param {Array} races
 * @param {number} [now]
 */
export function getScheduleCacheMs(races, now = Date.now()) {
    return isEventDay(races, now) ? EVENT_DAY_SCHEDULE_CACHE_MS : SCHEDULE_CACHE_MS;
}

/**
 * End of a race weekend's running, used to decide which round is "next".
 *
 * The result is memoised on the race object as a timestamp rather than a
 * Date: a schedule's session times never change once parsed, and handing
 * every caller a fresh Date keeps the cache safe from in-place Date mutations.
 *
 * @param {Object} race - The race object.
 * @returns {Date} - End time of the race.
 */
export function getRaceEndTime(race) {
    if (!race) return new Date(NaN);
    if (typeof race._endTimeMs === 'number') return new Date(race._endTimeMs);

    let end;
    const raceSession = Array.isArray(race.sessions) ? race.sessions.find(s => s.id === 'race') : null;
    if (raceSession && raceSession.date && raceSession.time) {
        end = new Date(`${raceSession.date}T${raceSession.time}`);
        end.setHours(end.getHours() + CONFIG.RACE_DURATION_BUFFER_HOURS);
    } else if (race.date && race.time) {
        // No session called 'race' (e.g. the F2/F3 Feature Race): the round's own
        // date/time is its headline race
        end = new Date(`${race.date}T${race.time}`);
        end.setHours(end.getHours() + CONFIG.RACE_DURATION_BUFFER_HOURS);
    } else {
        // Fallback if no time (shouldn't happen for recent races)
        end = new Date(race.date);
        end.setHours(end.getHours() + CONFIG.RACE_DAY_END_HOUR);
    }

    // An unparseable date yields NaN; leave it uncached so a later fix to
    // the schedule data is picked up rather than frozen in.
    if (!Number.isNaN(end.getTime())) {
        Object.defineProperty(race, '_endTimeMs', {
            value: end.getTime(),
            enumerable: false,
            writable: true,
            configurable: true
        });
    } else {
        delete race._endTimeMs;
    }
    return end;
}
