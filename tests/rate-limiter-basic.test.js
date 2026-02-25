import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../src/worker-utils.js';

describe('RateLimiter Basic Functionality', () => {
    let limiter;

    beforeEach(() => {
        vi.useFakeTimers();
        // Start at a known time (e.g., T=1000)
        vi.setSystemTime(1000);
        // 10 requests per 1000ms
        limiter = new RateLimiter(10, 1000);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('allows requests under the limit', () => {
        expect(limiter.check('1.1.1.1')).toBe(true);
        expect(limiter.check('1.1.1.1')).toBe(true);
    });

    it('blocks requests over the limit', () => {
        // Consume all 10 tokens
        for (let i = 0; i < 10; i++) {
            expect(limiter.check('2.2.2.2')).toBe(true);
        }
        // 11th request should be blocked
        expect(limiter.check('2.2.2.2')).toBe(false);
    });

    it('resets after window expires', () => {
        // Fill bucket
        for (let i = 0; i < 10; i++) {
            limiter.check('3.3.3.3');
        }
        expect(limiter.check('3.3.3.3')).toBe(false);

        // Advance time beyond window (1000ms) + small buffer
        vi.advanceTimersByTime(1100);

        // Should work again
        expect(limiter.check('3.3.3.3')).toBe(true);
    });

    it('tracks distinct IPs independently', () => {
        // Exhaust IP 4.4.4.4
        for (let i = 0; i < 10; i++) {
            limiter.check('4.4.4.4');
        }
        expect(limiter.check('4.4.4.4')).toBe(false);

        // IP 5.5.5.5 should still be allowed
        expect(limiter.check('5.5.5.5')).toBe(true);
    });
});
