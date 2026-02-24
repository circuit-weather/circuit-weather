import { describe, it, expect } from 'vitest';
import { F1API } from '../public/src/api/F1API.js';

describe('F1API', () => {
    describe('parseRace', () => {
        // We only test parseRace, so we don't need to mock fetch/cache for the constructor
        const api = new F1API();

        it('should correctly parse a standard race weekend', () => {
            const raceData = {
                round: "1",
                raceName: "Bahrain Grand Prix",
                Circuit: { Location: { country: "Bahrain" } },
                date: "2023-03-05",
                time: "15:00:00Z",
                FirstPractice: { date: "2023-03-03", time: "11:30:00Z" },
                SecondPractice: { date: "2023-03-03", time: "15:00:00Z" },
                ThirdPractice: { date: "2023-03-04", time: "11:30:00Z" },
                Qualifying: { date: "2023-03-04", time: "15:00:00Z" }
            };

            const result = api.parseRace(raceData);

            expect(result.name).toBe("Bahrain Grand Prix");
            expect(result.round).toBe("1");
            expect(result.sessions).toHaveLength(5); // FP1, FP2, FP3, Quali, Race

            const sessionIds = result.sessions.map(s => s.id);
            expect(sessionIds).toEqual(['fp1', 'fp2', 'fp3', 'qualifying', 'race']);

            // Verify a specific session detail
            const fp1 = result.sessions.find(s => s.id === 'fp1');
            expect(fp1.name).toBe('FP1');
            expect(fp1.date).toBe('2023-03-03');
            expect(fp1.time).toBe('11:30:00Z');
        });

        it('should correctly parse a sprint race weekend', () => {
             const raceData = {
                round: "4",
                raceName: "Azerbaijan Grand Prix",
                Circuit: { Location: { country: "Azerbaijan" } },
                date: "2023-04-30",
                time: "11:00:00Z",
                FirstPractice: { date: "2023-04-28", time: "09:30:00Z" },
                Qualifying: { date: "2023-04-28", time: "13:00:00Z" },
                SprintQualifying: { date: "2023-04-29", time: "08:30:00Z" },
                Sprint: { date: "2023-04-29", time: "13:30:00Z" }
            };

            const result = api.parseRace(raceData);

            expect(result.name).toBe("Azerbaijan Grand Prix");
            expect(result.sessions).toHaveLength(5); // FP1, Quali, Sprint Quali, Sprint, Race

            const sessionIds = result.sessions.map(s => s.id);
            // The order depends on the implementation, but let's check content
            expect(sessionIds).toContain('fp1');
            expect(sessionIds).toContain('qualifying');
            expect(sessionIds).toContain('sprint-quali');
            expect(sessionIds).toContain('sprint');
            expect(sessionIds).toContain('race');

            // Ensure FP2/FP3 are NOT present
            expect(sessionIds).not.toContain('fp2');
            expect(sessionIds).not.toContain('fp3');
        });

        it('should handle missing sessions gracefully (e.g. Monaco usually has all, but maybe data is partial)', () => {
             const raceData = {
                round: "6",
                raceName: "Monaco Grand Prix",
                Circuit: { Location: { country: "Monaco" } },
                date: "2023-05-28",
                time: "13:00:00Z",
                // Only FP1 and Race are present in this partial data
                FirstPractice: { date: "2023-05-26", time: "11:30:00Z" }
            };

            const result = api.parseRace(raceData);

            expect(result.name).toBe("Monaco Grand Prix");
            expect(result.sessions).toHaveLength(2); // FP1 and Race (Race is always added manually at the end)

            const sessionIds = result.sessions.map(s => s.id);
            expect(sessionIds).toEqual(['fp1', 'race']);
        });
    });
});
