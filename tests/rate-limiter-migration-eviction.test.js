import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/worker-utils.js';

describe('RateLimiter Migration Eviction', () => {
  let limiter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts oldest currentGen entry when migrating from oldGen to a full currentGen', () => {
    const LIMIT = 10;
    const WINDOW = 1000;
    const MAX_IPS = 2; // Small capacity to force eviction

    vi.setSystemTime(0);
    limiter = new RateLimiter(LIMIT, WINDOW, MAX_IPS);

    // 1. Setup IP_OLD in oldGen (active late in first window)
    vi.setSystemTime(900);
    limiter.check('IP_OLD');

    // 2. Trigger Rotation & Fill Current Generation
    vi.setSystemTime(1010);

    // IP_A consumes 5 tokens.
    for (let i = 0; i < 5; i++) {
      limiter.check('IP_A');
    }

    // IP_B consumes 1 token.
    limiter.check('IP_B');

    // 3. Trigger Migration
    // IP_OLD migrates from oldGen to currentGen.
    // Since currentGen is full (size 2), this triggers eviction of oldest entry (IP_A).
    vi.setSystemTime(1020);
    limiter.check('IP_OLD');

    // 4. Verify Eviction Behavior
    // If IP_A was evicted, it is treated as a NEW user (LIMIT-1 tokens).
    // If it was kept, it would have ~5 tokens.

    vi.setSystemTime(1030);

    // Attempt to consume 6 tokens.
    // New user (9 tokens) -> All succeed.
    // Existing user (~5 tokens) -> Fail after ~5.
    let successCount = 0;
    for (let i = 0; i < 6; i++) {
      if (limiter.check('IP_A')) {
        successCount++;
      }
    }

    expect(successCount).toBe(6);
  });
});
