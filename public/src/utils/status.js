/**
 * Determines the status of a session based on current time.
 * @param {Object} session - The session object (must have date and time).
 * @param {Date} now - The current date/time.
 * @returns {string} - 'LIVE', 'FUTURE', 'PAST', or 'UNKNOWN'.
 */
export function getSessionStatus(session, now) {
    if (!session || !session.date || !session.time) return 'UNKNOWN';

    const start = new Date(`${session.date}T${session.time}`);
    // Assume 2 hours duration for most sessions, 3 hours for race.
    let durationHours = 2;
    if (session.id === 'race') {
        durationHours = 3;
    }

    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);

    if (now >= start && now <= end) {
        return 'LIVE';
    } else if (now < start) {
        return 'FUTURE';
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

    // Find earliest start and latest end
    let minStart = null;
    let maxEnd = null;
    let anySessionLive = false;

    race.sessions.forEach(session => {
        if (!session.date || !session.time) return;
        const start = new Date(`${session.date}T${session.time}`);

        let durationHours = 2;
        if (session.id === 'race') durationHours = 4; // Use 4h for round-level "Live" to be safe

        const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);

        if (!minStart || start < minStart) minStart = start;
        if (!maxEnd || end > maxEnd) maxEnd = end;

        if (now >= start && now <= end) {
            anySessionLive = true;
        }
    });

    if (!minStart || !maxEnd) return 'UNKNOWN';

    if (anySessionLive) {
        return 'LIVE';
    } else if (now >= minStart && now <= maxEnd) {
        return 'CURRENT';
    } else if (now < minStart) {
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
