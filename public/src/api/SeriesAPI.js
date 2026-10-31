import { CONFIG } from '../config.js';
import { SafeStorage } from '../utils/storage.js';
import { isScheduleOver, getScheduleCacheMs } from '../utils/schedule.js';

/**
 * Schedules for series other than F1, from the Worker's /api/schedule/{series}
 * endpoint (TheSportsDB). The Worker already returns Ergast-shaped races with a
 * ready-made sessions array.
 *
 * The Worker builds a season a few rounds at a time to stay within TheSportsDB's
 * rate limit, so a response can be partial (`complete: false`). Partial schedules
 * are only cached briefly so the full one replaces them.
 */
export class SeriesAPI {
    constructor() {
        this.cache = new Map();
        this.LOCAL_STORAGE_KEY = 'series_schedule_cache';
        this.PARTIAL_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * @param {string} series e.g. 'f2'
     * @param {{refresh?: boolean}} [options] refresh skips the cached copies
     * @returns {Promise<{races: Array, complete: boolean}>}
     */
    async getSchedule(series, { refresh = false } = {}) {
        if (!refresh && this.cache.has(series)) return this.cache.get(series);

        const stored = this.readStored()[series];
        // SEC: Validate the stored shape so poisoned localStorage cannot break the app
        const valid = stored && Number.isFinite(stored.timestamp) && Array.isArray(stored.races);
        if (!refresh && valid) {
            // A week, or an hour on the day of an event
            const maxAge = stored.complete ? getScheduleCacheMs(stored.races) : this.PARTIAL_CACHE_DURATION_MS;
            // A finished season is re-fetched: the Worker moves on to next season
            // once its first round is listed
            if (Date.now() - stored.timestamp < maxAge && !isScheduleOver(stored.races)) return this.remember(series, stored);
        }

        try {
            const schedule = await this.fetchSchedule(series);
            this.store(series, schedule);
            return this.remember(series, schedule);
        } catch (error) {
            console.warn(`${series} schedule fetch failed:`, error);
            // The schedule rarely changes, so an expired copy beats showing nothing
            if (valid) return this.remember(series, stored);
            throw new Error(`SERIES_SCHEDULE_UNAVAILABLE:${series}`);
        }
    }

    async fetchSchedule(series) {
        const response = await fetch(`${CONFIG.scheduleApiBase}/${encodeURIComponent(series)}`, {
            // SEC: Add timeout to prevent hanging connections if the proxy is unresponsive
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data?.races)) throw new Error('Invalid schedule');
        return { races: data.races, complete: data.complete === true };
    }

    remember(series, { races, complete }) {
        const schedule = { races, complete: complete === true };
        this.cache.set(series, schedule);
        return schedule;
    }

    readStored() {
        try {
            const parsed = JSON.parse(SafeStorage.getItem(this.LOCAL_STORAGE_KEY) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }

    store(series, { races, complete }) {
        const all = this.readStored();
        all[series] = { timestamp: Date.now(), races, complete };
        SafeStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(all));
    }

    parseRace(race) {
        const sessions = Array.isArray(race.sessions)
            ? race.sessions.filter(s => s && typeof s.id === 'string' && typeof s.name === 'string')
            : [];
        return {
            round: race.round,
            name: race.raceName,
            circuit: race.Circuit,
            location: race.Circuit?.Location,
            sessions,
            date: race.date,
            time: race.time,
        };
    }
}
