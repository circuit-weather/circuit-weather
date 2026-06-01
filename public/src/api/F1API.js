import { CONFIG } from '../config.js';
import { SafeStorage } from '../utils/storage.js';

export class F1API {
    constructor() {
        this.cache = new Map();
        this.LOCAL_STORAGE_KEY = 'f1_schedule_cache';
        this.CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    }

    async getSchedule() {
        const cacheKey = 'schedule';
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        // Try to get from localStorage first
        const cachedDataStr = SafeStorage.getItem(this.LOCAL_STORAGE_KEY);
        if (cachedDataStr) {
            try {
                const cachedData = JSON.parse(cachedDataStr);
                const now = Date.now();
                // SEC: Validate that cachedData.races is an Array to prevent application logic bypass/errors from poisoned localStorage
                if (cachedData.timestamp && (now - cachedData.timestamp < this.CACHE_DURATION_MS) && Array.isArray(cachedData.races)) {
                    this.cache.set(cacheKey, cachedData.races);
                    return cachedData.races;
                }
            } catch (e) {
                // Ignore parse errors, just fetch fresh
                console.warn('Failed to parse cached schedule:', e);
            }
        }

        // SEC: Timeout is generous (15 s) because the worker may need to try two upstreams
        // (Jolpica then OpenF1) before responding.
        let response;
        try {
            response = await fetch(`${CONFIG.f1ApiBase}/current.json`, {
                signal: AbortSignal.timeout(15000)
            });
        } catch {
            // Network error or timeout — tag as a schedule error so the app shows
            // a useful message rather than the generic init failure.
            throw new Error('F1_SCHEDULE_UNAVAILABLE:jolpica:NETWORK');
        }
        if (!response.ok) {
            const sources = response.headers.get('X-Schedule-Sources-Tried') || 'jolpica';
            throw new Error(`F1_SCHEDULE_UNAVAILABLE:${sources}:HTTP ${response.status}`);
        }

        const data = await response.json();
        const races = data.MRData?.RaceTable?.Races || [];

        this.cache.set(cacheKey, races);

        // Save to localStorage
        SafeStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify({
            timestamp: Date.now(),
            races: races
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
