import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/worker-utils.js';

describe('RateLimiter Memory Leak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prevents currentGen from growing beyond limit when migrating oldGen records', () => {
    const MAX_IPS = 2;
    const WINDOW_MS = 1000;
    const limiter = new RateLimiter(10, WINDOW_MS, MAX_IPS);

    // 1. Fill currentGen with Batch A (IP1, IP2)
    limiter.check('1.1.1.1');
    limiter.check('2.2.2.2');

    // Update lastCheck for IP1, IP2 so they survive migration logic
    // (must be within windowMs when checked later)
    vi.setSystemTime(900);
    limiter.check('1.1.1.1');
    limiter.check('2.2.2.2');

    expect(limiter.currentGen.size).toBe(2);

    // 2. Advance time to T=1001 to trigger cleanup
    // 1001 - 0 > 1000, so cleanup runs.
    vi.setSystemTime(1001);

    // Trigger cleanup by calling check() with a new IP
    limiter.check('trigger');
    // Now: oldGen has {IP1, IP2} (lastCheck=900), currentGen has {trigger}

    // 3. Fill currentGen with Batch B (IP3) so it reaches MAX_IPS
    // currentGen already has 'trigger' (size 1)
    limiter.check('3.3.3.3');
    expect(limiter.currentGen.size).toBe(2); // {trigger, IP3}

    // 4. Access oldGen records (IP1, IP2).
    // They are valid because 1001 - 900 = 101 <= 1000.
    // They should migrate to currentGen.

    // IP1 migrates. currentGen should evict oldest ('trigger') to make room.
    limiter.check('1.1.1.1');
    expect(limiter.currentGen.size).toBe(2);
    expect(limiter.currentGen.has('trigger')).toBe(false); // 'trigger' was oldest
    expect(limiter.currentGen.has('3.3.3.3')).toBe(true);
    expect(limiter.currentGen.has('1.1.1.1')).toBe(true);

    // IP2 migrates. currentGen should evict oldest ('3.3.3.3') to make room.
    limiter.check('2.2.2.2');
    expect(limiter.currentGen.size).toBe(2);
    expect(limiter.currentGen.has('3.3.3.3')).toBe(false);
    expect(limiter.currentGen.has('1.1.1.1')).toBe(true);
    expect(limiter.currentGen.has('2.2.2.2')).toBe(true);

    // 5. Final check
    expect(limiter.currentGen.size).toBeLessThanOrEqual(MAX_IPS);
  });
});
