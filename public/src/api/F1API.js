import { CONFIG } from '../config.js';

export class F1API {
    constructor() {
        this.cache = new Map();
    }

    async getSchedule() {
        const cacheKey = 'schedule';
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const response = await fetch(`${CONFIG.f1ApiBase}/current.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const races = data.MRData?.RaceTable?.Races || [];

        this.cache.set(cacheKey, races);
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
