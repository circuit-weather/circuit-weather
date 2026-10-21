/**
 * Retrieves or caches the start timestamp in milliseconds for a session object.
 * @param {Object} session - The session object.
 * @param {Date} [parsedStart] - Optional pre-parsed Date object.
 * @returns {number} - Timestamp in ms, or NaN if invalid.
 */
function getSessionStartMs(session, parsedStart) {
    if (parsedStart) return parsedStart.getTime();
    if (typeof session._startMs === 'number') return session._startMs;
    if (!session.date || !session.time) return NaN;

    const ms = new Date(`${session.date}T${session.time}`).getTime();
    if (!Number.isNaN(ms)) {
        Object.defineProperty(session, '_startMs', {
            value: ms,
            enumerable: false,
            writable: true,
            configurable: true
        });
    }
    return ms;
}

/**
 * Determines the status of a session based on current time.
 * @param {Object} session - The session object (must have date and time).
 * @param {Date} now - The current date/time.
 * @param {Date} [parsedStart] - Optional pre-parsed Date object for session start.
 * @returns {string} - 'LIVE', 'FUTURE', 'PAST', or 'UNKNOWN'.
 */
export function getSessionStatus(session, now, parsedStart) {
    if (!session || (!parsedStart && (!session.date || !session.time))) return 'UNKNOWN';

    const startMs = getSessionStartMs(session, parsedStart);
    if (Number.isNaN(startMs)) return 'UNKNOWN';

    const nowMs = now.getTime();
    if (nowMs < startMs) {
        return 'FUTURE';
    }

    // Assume 2 hours duration for most sessions, 3 hours for race.
    const durationHours = session.id === 'race' ? 3 : 2;
    const endMs = startMs + durationHours * 60 * 60 * 1000;

    if (nowMs <= endMs) {
        return 'LIVE';
    } else {
        return 'PAST';
    }
}

/**
 * Determines the status of a round (race weekend).
 * @param {Object} race - The race object with sessions array.
 * @param {Date} now - The current date/time.
 * @returns {string} - 'LIVE', 'FUTURE', 'PAST', or 'UNKNOWN'.
 */
export function getRoundStatus(race, now) {
    if (!race || !race.sessions || race.sessions.length === 0) return 'UNKNOWN';

    const nowMs = now.getTime();
    let minStartMs = Infinity;
    let maxEndMs = -Infinity;
    let anySessionLive = false;

    for (let i = 0; i < race.sessions.length; i++) {
        const session = race.sessions[i];
        if (!session.date || !session.time) continue;

        const startMs = getSessionStartMs(session);
        if (Number.isNaN(startMs)) continue;

        const durationHours = session.id === 'race' ? 4 : 2; // Use 4h for round-level "Live" to be safe
        const endMs = startMs + durationHours * 60 * 60 * 1000;

        if (startMs < minStartMs) minStartMs = startMs;
        if (endMs > maxEndMs) maxEndMs = endMs;

        if (nowMs >= startMs && nowMs <= endMs) {
            anySessionLive = true;
        }
    }

    if (minStartMs === Infinity || maxEndMs === -Infinity) return 'UNKNOWN';

    if (anySessionLive) {
        return 'LIVE';
    } else if (nowMs >= minStartMs && nowMs <= maxEndMs) {
        return 'CURRENT';
    } else if (nowMs < minStartMs) {
        return 'FUTURE';
    } else {
        return 'PAST';
    }
}

/**
 * Formats a label with status indicators.
 * @param {string} label - The original label.
 * @param {string} status - The status ('LIVE', 'FUTURE', 'PAST', 'CURRENT').
 * @param {boolean} isNext - Whether this item is the next upcoming one.
 * @returns {string} - The formatted label.
 */
export function formatStatusLabel(label, status, isNext) {
    if (status === 'LIVE') {
        return `🔴 ${i18n.t('status.live')} ${label}`;
    }
    if (status === 'CURRENT') {
        return `(${i18n.t('status.current')}) ${label}`;
    }
    if (isNext) {
        return `(${i18n.t('status.next')}) ${label}`;
    }
    return label;
}
import { i18n } from '../i18n/index.js';
