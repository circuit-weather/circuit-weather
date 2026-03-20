import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/worker-utils.js';

describe('RateLimiter Expiry Logic', () => {
  let limiter;
  const WINDOW_MS = 1000;
  const LIMIT = 10;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    limiter = new RateLimiter(LIMIT, WINDOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replenishes tokens correctly based on elapsed time within window', () => {
    // 1. Check IP, should consume 1 token (tokens left: LIMIT - 1 = 9)
    limiter.check('valid-ip');
    expect(limiter.store.get('valid-ip').tokens).toBe(LIMIT - 1);

    // 2. Advance time by half the window
    vi.setSystemTime(500);

    // Check IP again, should replenish half the tokens (5) then consume 1
    // Math.min(10, 9 + 5) = 10 -> consume 1 = 9
    limiter.check('valid-ip');
    expect(limiter.store.get('valid-ip').tokens).toBe(LIMIT - 1);

    // 3. Advance time just a little bit
    vi.setSystemTime(600);
    // Should replenish 1 token (1/1000 * 10 * 100 = 1) then consume 1
    limiter.check('valid-ip');
    expect(limiter.store.get('valid-ip').tokens).toBe(LIMIT - 1);
  });

  it('replenishes tokens up to the limit after a full window has passed', () => {
    // 1. Consume all tokens
    for (let i = 0; i < LIMIT; i++) {
      limiter.check('stale-ip');
    }
    // Should be completely exhausted
    expect(limiter.check('stale-ip')).toBe(false);

    // 2. Advance time beyond window
    vi.setSystemTime(1500);

    // 3. Check again, should be fully replenished
    expect(limiter.check('stale-ip')).toBe(true);

    // Since it was fully replenished to LIMIT (10) and we just consumed 1,
    // it should have LIMIT - 1 (9) tokens left
    expect(limiter.store.get('stale-ip').tokens).toBe(LIMIT - 1);
  });
});
