/**
 * Notices when our Worker is switched off, so the app can say so instead of
 * blaming each data source in turn.
 *
 * Every Worker response, errors included, is JSON (createErrorResponse in
 * src/worker-utils.js). When Cloudflare turns the Worker off, /api/* gets
 * Cloudflare's own HTML error page instead: error 1027 once the account's
 * daily Workers request limit is used up (it resets at midnight UTC), or
 * another error page if Cloudflare can't run it. The static page itself is
 * still served, so the app loads but schedules, radar and warnings don't.
 */

export const API_STATUS_EVENT = 'api:status';

/** @typedef {'limit'|'down'|null} ApiOutage */

let outage = null;
// When the outage was noticed, in whole seconds (the Date header's resolution)
let outageSince = 0;

/** @returns {ApiOutage} 'limit' (daily limit used up), 'down', or null when working */
export function getApiOutage() {
    return outage;
}

function setOutage(next) {
    if (next === outage) return;
    outage = next;
    outageSince = next ? Math.floor(Date.now() / 1000) * 1000 : 0;
    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
        document.dispatchEvent(new CustomEvent(API_STATUS_EVENT, { detail: { outage: next } }));
    }
}

const isJson = (response) => (response.headers?.get?.('content-type') || '').includes('application/json');

/**
 * Looks at a /api/* response. Call it on every one: errors mark the outage,
 * and a fresh success clears it.
 * @param {Response} response
 */
export async function noteApiResponse(response) {
    try {
        if (!response) return;
        if (response.ok) {
            // A response the browser kept from before the outage proves nothing,
            // so only one the Worker sent since then clears it
            const sent = Date.parse(response.headers?.get?.('date') || '');
            if (outage && Number.isFinite(sent) && sent >= outageSince) setOutage(null);
            return;
        }
        if (isJson(response)) return; // The Worker answered: an ordinary error
        const body = await response.clone().text();
        setOutage(/\b1027\b/.test(body) ? 'limit' : 'down');
    } catch {
        // Never let status tracking break the request it is watching
    }
}

/** The next midnight UTC, when the daily Workers request limit resets. */
export function nextLimitReset(now = Date.now()) {
    const reset = new Date(now);
    reset.setUTCHours(24, 0, 0, 0);
    return reset;
}

/** Test helper: forget any outage. */
export function resetApiStatus() {
    outage = null;
    outageSince = 0;
}
