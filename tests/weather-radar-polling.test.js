import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DOM
const createMockElement = (id) => ({
    id,
    addEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn().mockReturnValue(true)
    },
    style: {},
    setAttribute: vi.fn(),
    textContent: ''
});

const documentMock = {
    getElementById: vi.fn((id) => createMockElement(id)),
    addEventListener: vi.fn(),
    activeElement: { tagName: 'BODY' },
    createElement: vi.fn(() => createMockElement('created'))
};

const navigatorMock = { language: 'en-US' };

vi.stubGlobal('document', documentMock);
vi.stubGlobal('navigator', navigatorMock);
vi.stubGlobal('window', { addEventListener: vi.fn() });
vi.stubGlobal('L', { tileLayer: vi.fn(), map: vi.fn() });
vi.stubGlobal('fetch', vi.fn());

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => 1));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

// Import the class under test
const { WeatherRadar } = await import('../public/src/map/WeatherRadar.js');

describe('WeatherRadar Polling Logic', () => {
    let radar;
    let mockMap;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.spyOn(global, 'setInterval');

        mockMap = {
            removeLayer: vi.fn(),
            invalidateSize: vi.fn(),
            hasLayer: vi.fn(),
            addLayer: vi.fn(),
            on: vi.fn(),
            off: vi.fn()
        };

        radar = new WeatherRadar(mockMap);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('scheduleNextPoll', () => {
        it('should schedule next poll aligned to 10-minute intervals + 1 min offset', async () => {
            // Setup time: 12:05:00
            // Next update window: 12:10:00 (RainViewer updates every 10 mins)
            // Poll target: 12:11:00 (1 min offset)
            // Expected delay: 6 minutes (360,000ms)

            const now = new Date('2024-01-01T12:05:00Z').getTime();
            vi.setSystemTime(now);

            const checkSpy = vi.spyOn(radar.polling, 'checkForUpdates').mockImplementation(() => Promise.resolve());

            radar.scheduleNextPoll(); // Manual call

            // 1 from constructor (relativeTimeInterval) + 1 from scheduleNextPoll
            expect(vi.getTimerCount()).toBe(2);

            // Spy on the recursive call
            const spy = vi.spyOn(radar.polling, 'scheduleNextPoll');

            // Advance time to trigger the timeout (6 minutes)
            // Awaiting advanceTimersByTimeAsync because the timeout callback is now async
            await vi.advanceTimersByTimeAsync(6 * 60 * 1000 + 100);

            expect(checkSpy).toHaveBeenCalled();
            expect(spy).toHaveBeenCalledTimes(1); // Recursive call (from inside timeout)
        });

        it('should handle time just after an update window', () => {
            // Setup time: 12:12:00 (2 mins after update)
            // Next update window: 12:20:00
            // Poll target: 12:21:00
            // Expected delay: 9 minutes (540,000ms)

            const now = new Date('2024-01-01T12:12:00Z').getTime();
            vi.setSystemTime(now);

            const spy = vi.spyOn(global, 'setTimeout');

            radar.scheduleNextPoll();

            expect(spy).toHaveBeenCalledWith(expect.any(Function), 540000);
        });

        it('should enforce minimum delay of 30 seconds', () => {
            // Setup time: 12:10:59 (1 second before poll target)
            // Poll target: 12:11:00
            // Raw delay: 1000ms
            // Expected delay: 30000ms (min buffer)

            const now = new Date('2024-01-01T12:10:59Z').getTime();
            vi.setSystemTime(now);

            const spy = vi.spyOn(global, 'setTimeout');

            radar.scheduleNextPoll();

            expect(spy).toHaveBeenCalledWith(expect.any(Function), 30000);
        });
    });

    describe('checkForUpdates', () => {
        it('should not update if API returns empty', async () => {
            global.fetch.mockResolvedValueOnce({ ok: true,
                json: () => Promise.resolve({ radar: { past: [], nowcast: [] } })
            });

            const applySpy = vi.spyOn(radar, 'applyFrameUpdate');

            await radar.checkForUpdates();

            expect(applySpy).not.toHaveBeenCalled();
        });

        it('should not update if frames are identical', async () => {
            // Setup existing frames
            radar.frames = [
                { time: 100, path: '/path1' },
                { time: 200, path: '/path2' }
            ];

            // Mock API returning same frames
            global.fetch.mockResolvedValueOnce({ ok: true,
                json: () => Promise.resolve({
                    radar: {
                        past: [{ time: 100, path: '/path1' }],
                        nowcast: [{ time: 200, path: '/path2' }]
                    }
                })
            });

            const applySpy = vi.spyOn(radar, 'applyFrameUpdate');

            await radar.checkForUpdates();

            expect(applySpy).not.toHaveBeenCalled();
        });

        it('should update if frames have changed', async () => {
            // Setup existing frames
            radar.frames = [
                { time: 100, path: '/path1' }
            ];
            radar.playback.isPlaying = true;

            // Mock API returning new frames
            global.fetch.mockResolvedValueOnce({ ok: true,
                json: () => Promise.resolve({
                    radar: {
                        past: [{ time: 100, path: '/path1' }],
                        nowcast: [{ time: 300, path: '/path3' }] // New frame
                    }
                })
            });

            const applySpy = vi.spyOn(radar, 'applyFrameUpdate').mockImplementation(() => {});

            await radar.checkForUpdates();

            expect(applySpy).toHaveBeenCalled();
        });

        it('should defer update if not playing', async () => {
            radar.frames = [{ time: 100, path: '/path1' }];
            radar.playback.isPlaying = false;

            global.fetch.mockResolvedValueOnce({ ok: true,
                json: () => Promise.resolve({
                    radar: {
                        past: [{ time: 100, path: '/path1' }, { time: 200, path: '/path2' }],
                        nowcast: []
                    }
                })
            });

            const applySpy = vi.spyOn(radar, 'applyFrameUpdate');

            await radar.checkForUpdates();

            expect(applySpy).not.toHaveBeenCalled();
            expect(radar.pendingFrames).toHaveLength(2);
        });
    });

    describe('Polling Control', () => {
        it('should clear timeout on stopPolling', () => {
            radar.polling.pollingTimeout = 123;
            const spy = vi.spyOn(global, 'clearTimeout');

            radar.stopPolling();

            expect(spy).toHaveBeenCalledWith(123);
            expect(radar.polling.pollingTimeout).toBeNull();
        });

        it('should restart polling on startPolling', () => {
            const stopSpy = vi.spyOn(radar.polling, 'stopPolling');
            const scheduleSpy = vi.spyOn(radar.polling, 'scheduleNextPoll');

            radar.startPolling();

            expect(stopSpy).toHaveBeenCalled();
            expect(scheduleSpy).toHaveBeenCalled();
            expect(radar.polling.stopped).toBe(false);
        });

        it('should continue polling cycle if started via startPolling', async () => {
            // Setup time: 12:05:00. Target: 12:11:00 (6 mins delay)
            const now = new Date('2024-01-01T12:05:00Z').getTime();
            vi.setSystemTime(now);

            const checkSpy = vi.spyOn(radar.polling, 'checkForUpdates').mockImplementation(() => Promise.resolve());

            radar.startPolling();
            expect(radar.polling.stopped).toBe(false);

            // Advance time to trigger first timeout (6 minutes)
            await vi.advanceTimersByTimeAsync(6 * 60 * 1000 + 100);
            expect(checkSpy).toHaveBeenCalledTimes(1);

            // Advance time to trigger second timeout (10 minutes)
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 100);
            expect(checkSpy).toHaveBeenCalledTimes(2);
        });
    });

});
