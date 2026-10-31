import { CONFIG } from '../config.js';
import { SafeStorage } from '../utils/storage.js';
import { isScheduleOver, getScheduleCacheMs } from '../utils/schedule.js';
import { fetchOpenF1Schedule } from './openf1.js';

export class F1API {
    constructor() {
        this.cache = new Map();
        this.LOCAL_STORAGE_KEY = 'f1_schedule_cache';
        // Which source supplied the current schedule: 'jolpica' (primary),
        // 'openf1' (fallback), or null before the first successful fetch.
        this.scheduleSource = null;
    }

    async getSchedule() {
        const cacheKey = 'schedule';
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        // Try to get from localStorage first
        // An expired cache is kept as a last resort if every source fails below.
        let expiredCache = null;
        const cachedDataStr = SafeStorage.getItem(this.LOCAL_STORAGE_KEY);
        if (cachedDataStr) {
            try {
                const cachedData = JSON.parse(cachedDataStr);
                const now = Date.now();
                // SEC: Validate that cachedData.races is an Array to prevent application logic bypass/errors from poisoned localStorage
                if (cachedData.timestamp && Array.isArray(cachedData.races)) {
                    // A week, or an hour on the day of an event. A finished season
                    // is re-fetched, to find next season's opener
                    if (now - cachedData.timestamp < getScheduleCacheMs(cachedData.races, now) && !isScheduleOver(cachedData.races, now)) {
                        return this.useStoredSchedule(cacheKey, cachedData);
                    }
                    expiredCache = cachedData;
                }
            } catch (e) {
                // Ignore parse errors, just fetch fresh
                console.warn('Failed to parse cached schedule:', e);
            }
        }

        // Primary source: Jolpica (via the Worker proxy for caching/privacy).
        try {
            const races = await this.fetchFromJolpica();
            return this.cacheSchedule(cacheKey, races, 'jolpica');
        } catch (jolpicaError) {
            console.warn('Jolpica schedule fetch failed, trying OpenF1 fallback:', jolpicaError);
        }

        // Fallback source: OpenF1, called directly from the browser. OpenF1 blocks
        // the Worker's datacenter IPs, so this fetch must originate client-side.
        try {
            const races = await fetchOpenF1Schedule();
            return this.cacheSchedule(cacheKey, races, 'openf1');
        } catch (openF1Error) {
            console.error('OpenF1 fallback also failed:', openF1Error);
            // The schedule rarely changes, so an expired copy beats showing nothing.
            // OpenF1 refuses keyless requests during live sessions, so this matters
            // most when Jolpica is also failing mid-session.
            if (expiredCache) return this.useStoredSchedule(cacheKey, expiredCache);
            throw new Error('F1_SCHEDULE_UNAVAILABLE:jolpica,openf1:ALL_SOURCES_FAILED');
        }
    }

    useStoredSchedule(cacheKey, cachedData) {
        this.cache.set(cacheKey, cachedData.races);
        // Preserve the originating source so the fallback notice stays
        // accurate while serving cached data (default to primary for
        // caches written before sources were tracked).
        this.scheduleSource = cachedData.source ?? 'jolpica';
        return cachedData.races;
    }

    // NOTE: Jolpica (Ergast-compatible) is Formula 1 only. There is no F2/F3
    // dataset behind it — the "/f1/" in the proxied path is a fixed Ergast route
    // segment, not a series selector ("/ergast/f2/" returns the F1 schedule).
    // Other series come from TheSportsDB through SeriesAPI instead.
    async fetchFromJolpica() {
        const data = await this.fetchJolpicaSeason('current');
        const races = data.MRData?.RaceTable?.Races || [];
        // Jolpica's "current" season only moves on in January. Once this season's
        // last race is over, next season's opener is the next round, so use next
        // season's calendar as soon as it is published.
        const season = Number(data.MRData?.RaceTable?.season);
        if (Number.isInteger(season) && isScheduleOver(races)) {
            try {
                const next = await this.fetchJolpicaSeason(String(season + 1));
                const nextRaces = next.MRData?.RaceTable?.Races;
                if (Array.isArray(nextRaces) && nextRaces.length > 0) return nextRaces;
            } catch (error) {
                console.warn('Next F1 season not available yet:', error);
            }
        }
        return races;
    }

    async fetchJolpicaSeason(season) {
        const response = await fetch(`${CONFIG.f1ApiBase}/${season}.json`, {
            // SEC: Add timeout to prevent hanging connections if the proxy is unresponsive
            signal: AbortSignal.timeout(6000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    cacheSchedule(cacheKey, races, source) {
        this.cache.set(cacheKey, races);
        this.scheduleSource = source;
        SafeStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify({
            timestamp: Date.now(),
            races: races,
            source: source
        }));
        return races;
    }

    parseRace(race) {
        const sessions = [];

        if (race.FirstPractice) sessions.push({ id: 'fp1', name: 'FP1', ...race.FirstPractice });
        if (race.SecondPractice) sessions.push({ id: 'fp2', name: 'FP2', ...race.SecondPractice });
        if (race.ThirdPractice) sessions.push({ id: 'fp3', name: 'FP3', ...race.ThirdPractice });
        if (race.SprintQualifying) sessions.push({ id: 'sprint-quali', name: 'Sprint Quali', ...race.SprintQualifying });
        if (race.Sprint) sessions.push({ id: 'sprint', name: 'Sprint', ...race.Sprint });
        if (race.Qualifying) sessions.push({ id: 'qualifying', name: 'Qualifying', ...race.Qualifying });
        sessions.push({ id: 'race', name: 'Race', date: race.date, time: race.time });

        return {
            round: race.round,
            name: race.raceName,
            circuit: race.Circuit,
            location: race.Circuit?.Location,
            sessions,
            date: race.date,
        };
    }
}
