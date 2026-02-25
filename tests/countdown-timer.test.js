import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub document global before dynamic import
// CountdownTimer constructor accesses document.getElementById
vi.stubGlobal('document', {
    getElementById: vi.fn(() => null)
});

import { CountdownTimer } from '../public/src/ui/CountdownTimer.js';

describe('CountdownTimer', () => {

    describe('getAccessibleDuration', () => {
        let timer;

        beforeEach(() => {
            timer = new CountdownTimer();
        });

        it('formats days and hours for durations over 24 hours', () => {
            // 2 days, 3 hours = (2*24 + 3) * 3600000 = 183600000ms
            const diff = (2 * 24 + 3) * 3600000;
            expect(timer.getAccessibleDuration(diff)).toBe('2 days, 3 hours');
        });

        it('uses singular for exactly 1 day, 1 hour', () => {
            // 1 day, 1 hour = 25 * 3600000
            const diff = 25 * 3600000;
            expect(timer.getAccessibleDuration(diff)).toBe('1 day, 1 hour');
        });

        it('formats hours, minutes, and seconds for durations under 24 hours', () => {
            // 5h 30m 15s
            const diff = 5 * 3600000 + 30 * 60000 + 15 * 1000;
            expect(timer.getAccessibleDuration(diff)).toBe('5 hours, 30 minutes, 15 seconds');
        });

        it('handles only seconds', () => {
            const diff = 45 * 1000;
            expect(timer.getAccessibleDuration(diff)).toBe('45 seconds');
        });

        it('uses singular for 1 second', () => {
            const diff = 1000;
            expect(timer.getAccessibleDuration(diff)).toBe('1 second');
        });

        it('skips zero minutes but includes hours and seconds', () => {
            // 1h 0m 1s
            const diff = 3600000 + 1000;
            expect(timer.getAccessibleDuration(diff)).toBe('1 hour, 1 second');
        });

        it('uses singular for 1 hour, 1 minute', () => {
            // 1h 1m 0s
            const diff = 3600000 + 60000;
            expect(timer.getAccessibleDuration(diff)).toBe('1 hour, 1 minute, 0 seconds');
        });

        it('handles 0 hours remaining in the day portion', () => {
            // Exactly 2 days = 48h
            const diff = 48 * 3600000;
            expect(timer.getAccessibleDuration(diff)).toBe('2 days, 0 hours');
        });
    });
});
