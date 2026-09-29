import { CONFIG } from '../config.js';
import { getSessionStatus } from './status.js';

/**
 * End of a race weekend's running, used to decide which round is "next".
 *
 * The result is memoised on the race object as a timestamp rather than a
 * Date: a schedule's session times never change once parsed, and handing
 * every caller a fresh Date keeps the cache safe from the in-place
 * `setHours()` mutation this file uses elsewhere.
 *
 * @param {Object} race - Parsed race object.
 * @returns {Date} End time of race weekend.
 */
export function getRaceEndTime(race) {
    if (!race) return new Date(NaN);
    if (typeof race._endTimeMs === 'number') return new Date(race._endTimeMs);

    let end;
    const raceSession = race.sessions ? race.sessions.find(s => s.id === 'race') : null;
    if (raceSession && raceSession.date && raceSession.time) {
        end = new Date(`${raceSession.date}T${raceSession.time}`);
        end.setHours(end.getHours() + CONFIG.RACE_DURATION_BUFFER_HOURS);
    } else if (race.date) {
        // Fallback if no time (shouldn't happen for recent races)
        end = new Date(race.date);
        end.setHours(end.getHours() + CONFIG.RACE_DAY_END_HOUR);
    } else {
        end = new Date(NaN);
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

/**
 * Finds the index of the first race that has not yet ended.
 * @param {Array} races - Array of parsed race objects.
 * @param {Date} now - The current date/time.
 * @returns {number} - The index of the first active race, or races.length if none.
 */
export function findFirstActiveRaceIndex(races, now) {
    if (!races || !races.length) return 0;
    let low = 0;
    let high = races.length - 1;
    let firstActiveIndex = races.length;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (getRaceEndTime(races[mid]) > now) {
            firstActiveIndex = mid;
            // Keep searching left for potentially earlier active races
            high = mid - 1;
        } else {
            // Race has ended, search right
            low = mid + 1;
        }
    }
    return firstActiveIndex;
}

/**
 * Finds the overall next session in the entire season across all rounds.
 * @param {Array} races - Array of parsed race objects.
 * @param {Date} now - The current date/time.
 * @returns {Object|null} - { round, sessionId } or null.
 */
export function getGloballyNextSession(races, now) {
    if (!races || !races.length) return null;
    const firstActiveIndex = findFirstActiveRaceIndex(races, now);

    for (let i = firstActiveIndex; i < races.length; i++) {
        const race = races[i];
        if (!race || !race.sessions) continue;
        for (let j = 0; j < race.sessions.length; j++) {
            const s = race.sessions[j];
            if (getSessionStatus(s, now) === 'FUTURE') {
                return { round: race.round, sessionId: s.id };
            }
        }
    }
    return null;
}
