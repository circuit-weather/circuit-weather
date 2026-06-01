import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { F1API } from '../public/src/api/F1API.js';
import { SafeStorage } from '../public/src/utils/storage.js';

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

    describe('getSchedule', () => {
        let api;
        let mockFetch;

        beforeEach(() => {
            vi.clearAllMocks();
            mockFetch = vi.fn();
            vi.stubGlobal('fetch', mockFetch);
            vi.spyOn(SafeStorage, 'getItem');
            vi.spyOn(SafeStorage, 'setItem');
            api = new F1API();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('fetches and returns races from the API', async () => {
            const mockRaces = [
                { round: '1', raceName: 'Bahrain GP' },
                { round: '2', raceName: 'Saudi Arabian GP' },
            ];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    MRData: { RaceTable: { Races: mockRaces } }
                }),
            });

            const result = await api.getSchedule();
            expect(result).toEqual(mockRaces);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it('caches the result on subsequent calls', async () => {
            const mockRaces = [{ round: '1', raceName: 'Test GP' }];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    MRData: { RaceTable: { Races: mockRaces } }
                }),
            });

            const first = await api.getSchedule();
            const second = await api.getSchedule();

            expect(first).toEqual(mockRaces);
            expect(second).toEqual(mockRaces);
            // fetch should only be called once due to caching
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        // Minimal OpenF1 payload: one Bahrain race weekend
        const openF1Meetings = [{
            meeting_key: 1,
            meeting_name: 'Bahrain Grand Prix',
            circuit_short_name: 'Sakhir',
            location: 'Sakhir',
            country_name: 'Bahrain',
            date_start: '2026-03-20T11:30:00',
            year: 2026,
        }];
        const openF1Sessions = [
            { meeting_key: 1, session_type: 'Practice 1', date_start: '2026-03-20T11:30:00', gmt_offset: '03:00:00' },
            { meeting_key: 1, session_type: 'Qualifying', date_start: '2026-03-21T15:00:00', gmt_offset: '03:00:00' },
            { meeting_key: 1, session_type: 'Race',       date_start: '2026-03-22T15:00:00', gmt_offset: '03:00:00' },
        ];
        const mockOpenF1Success = () => {
            mockFetch
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(openF1Meetings) })
                .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(openF1Sessions) });
        };

        it('falls back to OpenF1 when Jolpica returns a non-OK response', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 500 }); // Jolpica
            mockOpenF1Success();

            const result = await api.getSchedule();

            expect(result).toHaveLength(1);
            expect(result[0].raceName).toBe('Bahrain Grand Prix');
            expect(result[0].Circuit.circuitId).toBe('bahrain');
            expect(result[0].date).toBe('2026-03-22');
            expect(result[0].time).toBe('12:00:00Z'); // 15:00 local UTC+3 → 12:00 UTC
            // 1 Jolpica + 2 OpenF1 (meetings + sessions)
            expect(mockFetch).toHaveBeenCalledTimes(3);
            // Result persisted to localStorage
            expect(SafeStorage.setItem).toHaveBeenCalledWith('f1_schedule_cache', expect.any(String));
        });

        it('falls back to OpenF1 when the Jolpica fetch throws (network error)', async () => {
            mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch')); // Jolpica
            mockOpenF1Success();

            const result = await api.getSchedule();

            expect(result).toHaveLength(1);
            expect(result[0].raceName).toBe('Bahrain Grand Prix');
        });

        it('throws a tagged schedule error when both Jolpica and OpenF1 fail', async () => {
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 500 }) // Jolpica
                .mockResolvedValueOnce({ ok: false, status: 403 }) // OpenF1 meetings
                .mockResolvedValueOnce({ ok: false, status: 403 }); // OpenF1 sessions

            await expect(api.getSchedule()).rejects.toThrow('F1_SCHEDULE_UNAVAILABLE:jolpica,openf1');
        });

        it('returns empty array when RaceTable has no Races', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    MRData: { RaceTable: {} }
                }),
            });

            const result = await api.getSchedule();
            expect(result).toEqual([]);
        });

        it('returns empty array when MRData is missing', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const result = await api.getSchedule();
            expect(result).toEqual([]);
        });

        it('returns cached data from localStorage if valid', async () => {
            const mockRaces = [{ round: '3', raceName: 'Local Storage GP' }];
            SafeStorage.getItem.mockReturnValueOnce(JSON.stringify({
                timestamp: Date.now(),
                races: mockRaces
            }));

            const result = await api.getSchedule();

            expect(result).toEqual(mockRaces);
            expect(mockFetch).not.toHaveBeenCalled();
            expect(SafeStorage.getItem).toHaveBeenCalledWith('f1_schedule_cache');
        });

        it('fetches fresh data if localStorage cache is expired', async () => {
            const mockRaces = [{ round: '4', raceName: 'Fresh GP' }];
            SafeStorage.getItem.mockReturnValueOnce(JSON.stringify({
                timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago (past 7-day TTL)
                races: [{ round: '3', raceName: 'Expired GP' }]
            }));
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    MRData: { RaceTable: { Races: mockRaces } }
                }),
            });

            const result = await api.getSchedule();

            expect(result).toEqual(mockRaces);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(SafeStorage.setItem).toHaveBeenCalledWith('f1_schedule_cache', expect.any(String));
        });

        it('fetches fresh data if localStorage contains invalid JSON', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const mockRaces = [{ round: '5', raceName: 'Invalid Cache GP' }];
            SafeStorage.getItem.mockReturnValueOnce('invalid-json');
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    MRData: { RaceTable: { Races: mockRaces } }
                }),
            });

            const result = await api.getSchedule();

            expect(result).toEqual(mockRaces);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(SafeStorage.setItem).toHaveBeenCalledWith('f1_schedule_cache', expect.any(String));
            warnSpy.mockRestore();
        });
    });
});
