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

  it('prevents store from growing beyond MAX_IPS limit under load', () => {
    const MAX_IPS = 2;
    const WINDOW_MS = 1000;
    const limiter = new RateLimiter(10, WINDOW_MS, MAX_IPS);

    // 1. Fill store with Batch A (IP1, IP2)
    limiter.check('1.1.1.1');
    limiter.check('2.2.2.2');

    expect(limiter.activeStore.size).toBe(2);

    // 2. Add more IPs, forcing eviction
    limiter.check('trigger');

    // Size should still be at most MAX_IPS
    expect(limiter.activeStore.size).toBeLessThanOrEqual(MAX_IPS);

    // 3. Keep adding more IPs to test eviction
    limiter.check('3.3.3.3');
    limiter.check('4.4.4.4');
    limiter.check('5.5.5.5');

    expect(limiter.activeStore.size).toBeLessThanOrEqual(MAX_IPS);
  });
});
