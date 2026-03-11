import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/worker-utils.js';

describe('RateLimiter Migration Exhausted', () => {
  let limiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a request migrating from oldGen if it still lacks tokens', () => {
    const LIMIT = 5;
    const WINDOW = 1000;
    const MAX_IPS = 100;

    vi.setSystemTime(0);
    limiter = new RateLimiter(LIMIT, WINDOW, MAX_IPS);

    // Consume all tokens late in the first window
    vi.setSystemTime(900);
    for (let i = 0; i < LIMIT; i++) {
      expect(limiter.check('IP_A')).toBe(true);
    }

    // Move time past window boundary to trigger rotation, but not enough to refill 1 token.
    vi.setSystemTime(1010);

    // This checks IP_A, finds it in oldGen, migrates it, and calculates it lacks tokens.
    expect(limiter.check('IP_A')).toBe(false);
  });
});
