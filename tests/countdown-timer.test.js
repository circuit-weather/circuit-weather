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

    describe('start', () => {
        let timer;

        beforeEach(() => {
            vi.useFakeTimers();
            timer = new CountdownTimer();
            // Mock UI elements with writable properties
            timer.ui = {
                timer: { textContent: '', setAttribute: vi.fn(), removeAttribute: vi.fn() },
                session: { textContent: '' },
                card: { style: {} },
            };
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('sets target time and session name', () => {
            const target = new Date('2025-01-01T12:00:00Z');
            timer.start(target, 'Race');
            expect(timer.targetTime).toBe(target);
            expect(timer.sessionName).toBe('Race');
        });

        it('makes the card visible for future targets', () => {
            const target = new Date(Date.now() + 3600000);
            timer.start(target, 'FP1');
            expect(timer.ui.card.style.display).toBe('block');
        });

        it('hides the card for past targets', () => {
            const target = new Date(Date.now() - 3600000);
            timer.start(target, 'FP1');
            expect(timer.ui.card.style.display).toBe('none');
        });

        it('starts an interval timer for future targets', () => {
            const target = new Date(Date.now() + 3600000);
            timer.start(target, 'FP1');
            expect(timer.timer).not.toBeNull();
        });

        it('stops previous timer when starting again', () => {
            const target1 = new Date(Date.now() + 3600000);
            const target2 = new Date(Date.now() + 7200000);
            timer.start(target1, 'FP1');
            const firstTimer = timer.timer;
            timer.start(target2, 'FP2');
            expect(timer.timer).not.toBe(firstTimer);
        });
    });

    describe('update', () => {
        let timer;

        beforeEach(() => {
            vi.useFakeTimers();
            timer = new CountdownTimer();
            timer.ui = {
                timer: { textContent: '', setAttribute: vi.fn(), removeAttribute: vi.fn() },
                session: { textContent: '' },
                card: { style: {} },
            };
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('hides the card when target is reached', () => {
            timer.targetTime = new Date(Date.now() - 1000);
            timer.update();
            expect(timer.ui.card.style.display).toBe('none');
        });

        it('displays HH:MM:SS for countdown under 24 hours', () => {
            // 2 hours, 30 minutes, 15 seconds from now
            const diff = 2 * 3600000 + 30 * 60000 + 15 * 1000;
            timer.targetTime = new Date(Date.now() + diff);
            timer.update();
            expect(timer.ui.timer.textContent).toBe('02:30:15');
        });

        it('displays day format for countdown over 24 hours', () => {
            // 3 days and 5 hours from now
            const diff = (3 * 24 + 5) * 3600000;
            timer.targetTime = new Date(Date.now() + diff);
            timer.update();
            expect(timer.ui.timer.textContent).toBe('3d 5h');
        });

        it('updates session name in UI', () => {
            timer.targetTime = new Date(Date.now() + 3600000);
            timer.sessionName = 'Qualifying';
            timer.update();
            expect(timer.ui.session.textContent).toBe('Qualifying');
        });

        it('sets aria-label with accessible duration', () => {
            timer.targetTime = new Date(Date.now() + 3600000);
            timer.update();
            expect(timer.ui.timer.setAttribute).toHaveBeenCalledWith(
                'aria-label',
                expect.stringContaining('hour')
            );
        });

        it('sets datetime attribute with ISO 8601 duration format', () => {
            // 2 hours, 30 minutes, 15 seconds
            const diff = (2 * 3600 + 30 * 60 + 15) * 1000;
            timer.targetTime = new Date(Date.now() + diff);
            timer.update();
            expect(timer.ui.timer.setAttribute).toHaveBeenCalledWith('datetime', 'PT2H30M15S');

            // Over 24 hours (e.g. 3 days and 5 hours)
            const diffDays = (3 * 24 + 5) * 3600000;
            timer.targetTime = new Date(Date.now() + diffDays);
            timer.update();
            expect(timer.ui.timer.setAttribute).toHaveBeenCalledWith('datetime', 'P3DT5H');
        });

    });

    describe('stop', () => {
        let timer;

        beforeEach(() => {
            vi.useFakeTimers();
            timer = new CountdownTimer();
            timer.ui = {
                timer: { textContent: '', setAttribute: vi.fn(), removeAttribute: vi.fn() },
                session: { textContent: '' },
                card: { style: {} },
            };
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('clears the interval', () => {
            const target = new Date(Date.now() + 3600000);
            timer.start(target, 'Race');
            expect(timer.timer).not.toBeNull();
            timer.stop();
            expect(timer.timer).toBeNull();
        });

        it('is safe to call when no timer is running', () => {
            expect(() => timer.stop()).not.toThrow();
        });
    });

    describe('show', () => {
        let timer;

        beforeEach(() => {
            timer = new CountdownTimer();
            timer.ui = {
                timer: null,
                session: null,
                card: { style: {} },
            };
        });

        it('sets display to block when visible', () => {
            timer.show(true);
            expect(timer.ui.card.style.display).toBe('block');
        });

        it('sets display to none when hidden', () => {
            timer.show(false);
            expect(timer.ui.card.style.display).toBe('none');
        });

        it('handles null card gracefully', () => {
            timer.ui.card = null;
            expect(() => timer.show(true)).not.toThrow();
        });
    });
});
