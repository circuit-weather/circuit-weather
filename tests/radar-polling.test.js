import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RadarPolling } from '../public/src/map/RadarPolling.js';

describe('RadarPolling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Constructor Defaults', () => {
        it('uses safe default callbacks when no options provided', async () => {
            const polling = new RadarPolling();

            expect(polling.getFrames()).toEqual([]);
            expect(polling.isPlaying()).toBe(false);
            expect(() => polling.applyFrameUpdate([])).not.toThrow();
            expect(() => polling.setPendingFrames([])).not.toThrow();
            expect(() => polling.onPastCountChange(0)).not.toThrow();

            const fetchResult = await polling.fetchFrames();
            expect(fetchResult).toEqual({ frames: [], pastCount: 0 });
        });
    });

    describe('areFramesEqual', () => {
        it('returns false if either array is null or undefined', () => {
            expect(RadarPolling.areFramesEqual(null, [])).toBe(false);
            expect(RadarPolling.areFramesEqual([], null)).toBe(false);
            expect(RadarPolling.areFramesEqual(undefined, undefined)).toBe(false);
        });

        it('returns false if arrays have different lengths', () => {
            const a = [{ time: 100, path: '/p1' }];
            const b = [{ time: 100, path: '/p1' }, { time: 200, path: '/p2' }];
            expect(RadarPolling.areFramesEqual(a, b)).toBe(false);
        });

        it('returns true if frames match in time and path', () => {
            const a = [{ time: 100, path: '/p1' }, { time: 200, path: '/p2' }];
            const b = [{ time: 100, path: '/p1' }, { time: 200, path: '/p2' }];
            expect(RadarPolling.areFramesEqual(a, b)).toBe(true);
        });

        it('returns false if frames differ in time or path', () => {
            const a = [{ time: 100, path: '/p1' }];
            const b = [{ time: 101, path: '/p1' }];
            const c = [{ time: 100, path: '/p2' }];

            expect(RadarPolling.areFramesEqual(a, b)).toBe(false);
            expect(RadarPolling.areFramesEqual(a, c)).toBe(false);
        });
    });

    describe('Polling Lifecycle', () => {
        it('startPolling clears existing timeout and schedules next poll', () => {
            const polling = new RadarPolling();
            const stopSpy = vi.spyOn(polling, 'stopPolling');
            const scheduleSpy = vi.spyOn(polling, 'scheduleNextPoll');

            polling.startPolling();

            expect(stopSpy).toHaveBeenCalled();
            expect(polling.stopped).toBe(false);
            expect(scheduleSpy).toHaveBeenCalled();
        });

        it('stopPolling sets stopped flag and clears timeout', () => {
            const polling = new RadarPolling();
            const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

            polling.pollingTimeout = 12345;
            polling.stopPolling();

            expect(polling.stopped).toBe(true);
            expect(clearTimeoutSpy).toHaveBeenCalledWith(12345);
            expect(polling.pollingTimeout).toBeNull();
        });

        it('does not schedule recursive poll if stopped during checkForUpdates', async () => {
            const polling = new RadarPolling({
                fetchFrames: vi.fn().mockResolvedValue({
                    frames: [{ time: 100, path: '/p1' }],
                    pastCount: 1
                })
            });

            vi.setSystemTime(new Date('2024-01-01T12:05:00Z').getTime());
            polling.startPolling();

            const scheduleSpy = vi.spyOn(polling, 'scheduleNextPoll');

            // Stop polling before timer fires
            polling.stopPolling();

            // Advance timers to execute pending timeout
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

            // scheduleNextPoll shouldn't be called after check
            expect(scheduleSpy).not.toHaveBeenCalled();
        });
    });

    describe('scheduleNextPoll', () => {
        it('calculates expected delay aligned to 10-minute cycle + 1-minute offset', async () => {
            // Setup time: 12:05:00 -> 5 mins since update
            // Next update interval: 10 mins. Offset: 1 min -> 12:11:00 target time.
            // Expected delay: 6 minutes (360,000ms)
            vi.setSystemTime(new Date('2024-01-01T12:05:00Z').getTime());

            const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
            const polling = new RadarPolling();

            polling.scheduleNextPoll();

            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 360000);
        });

        it('enforces MIN_POLL_DELAY_MS minimum delay', () => {
            // Setup time: 12:10:59 -> 1 second before poll target
            // Raw delay: 1000ms -> Minimum delay: 30000ms
            vi.setSystemTime(new Date('2024-01-01T12:10:59Z').getTime());

            const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
            const polling = new RadarPolling();

            polling.scheduleNextPoll();

            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
        });

        it('handles case where calculated delay exceeds updateIntervalMs', () => {
            // Delay calculation formula: delay = updateIntervalMs - msSinceLastUpdate + offsetMs
            // If msSinceLastUpdate is 0ms (:00 mark): delay = 10m - 0 + 1m = 11m (660,000ms)
            // Since 11m > 10m, delay -= 10m => 1 minute (60,000ms) delay
            vi.setSystemTime(new Date('2024-01-01T12:00:00Z').getTime());

            const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
            const polling = new RadarPolling();

            polling.scheduleNextPoll();

            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
        });
    });

    describe('checkForUpdates', () => {
        it('early returns when fetchFrames returns empty frames', async () => {
            const onPastCountChange = vi.fn();
            const polling = new RadarPolling({
                fetchFrames: vi.fn().mockResolvedValue({ frames: [], pastCount: 5 }),
                onPastCountChange
            });

            await polling.checkForUpdates();

            expect(onPastCountChange).not.toHaveBeenCalled();
        });

        it('early returns when fetchFrames returns null frames', async () => {
            const onPastCountChange = vi.fn();
            const polling = new RadarPolling({
                fetchFrames: vi.fn().mockResolvedValue({ frames: null, pastCount: 5 }),
                onPastCountChange
            });

            await polling.checkForUpdates();

            expect(onPastCountChange).not.toHaveBeenCalled();
        });

        it('notifies onPastCountChange and returns early when frames have not changed', async () => {
            const frames = [{ time: 100, path: '/p1' }];
            const onPastCountChange = vi.fn();
            const applyFrameUpdate = vi.fn();

            const polling = new RadarPolling({
                fetchFrames: vi.fn().mockResolvedValue({ frames, pastCount: 2 }),
                getFrames: () => frames,
                onPastCountChange,
                applyFrameUpdate
            });

            await polling.checkForUpdates();

            expect(onPastCountChange).toHaveBeenCalledWith(2);
            expect(applyFrameUpdate).not.toHaveBeenCalled();
        });

        it('applies frame update directly if isPlaying returns true', async () => {
            const oldFrames = [{ time: 100, path: '/p1' }];
            const newFrames = [{ time: 100, path: '/p1' }, { time: 200, path: '/p2' }];
            const applyFrameUpdate = vi.fn();
            const setPendingFrames = vi.fn();

            const polling = new RadarPolling({
                fetchFrames: vi.fn().mockResolvedValue({ frames: newFrames, pastCount: 1 }),
                getFrames: () => oldFrames,
                isPlaying: () => true,
                applyFrameUpdate,
                setPendingFrames
            });

            await polling.checkForUpdates();

            expect(applyFrameUpdate).toHaveBeenCalledWith(newFrames);
            expect(setPendingFrames).not.toHaveBeenCalled();
        });

        it('defers update via setPendingFrames if isPlaying returns false', async () => {
            const oldFrames = [{ time: 100, path: '/p1' }];
            const newFrames = [{ time: 100, path: '/p1' }, { time: 200, path: '/p2' }];
            const applyFrameUpdate = vi.fn();
            const setPendingFrames = vi.fn();

            const polling = new RadarPolling({
                fetchFrames: vi.fn().mockResolvedValue({ frames: newFrames, pastCount: 1 }),
                getFrames: () => oldFrames,
                isPlaying: () => false,
                applyFrameUpdate,
                setPendingFrames
            });

            await polling.checkForUpdates();

            expect(applyFrameUpdate).not.toHaveBeenCalled();
            expect(setPendingFrames).toHaveBeenCalledWith(newFrames);
        });

        it('catches error during fetchFrames and logs error to console', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const error = new Error('Network error');

            const polling = new RadarPolling({
                fetchFrames: vi.fn().mockRejectedValue(error)
            });

            await expect(polling.checkForUpdates()).resolves.toBeUndefined();

            expect(consoleSpy).toHaveBeenCalledWith('Failed to check for radar updates:', error);
            consoleSpy.mockRestore();
        });
    });
});
