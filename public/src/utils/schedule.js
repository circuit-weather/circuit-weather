import { CONFIG } from '../config.js';

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
