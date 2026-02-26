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
    // 1. Arrange
    const LIMIT = 10;
    const WINDOW = 1000;
    const MAX_IPS = 2; // Small capacity to force eviction

    // Start at t=0
    vi.setSystemTime(0);
    limiter = new RateLimiter(LIMIT, WINDOW, MAX_IPS);

    // 2. Setup OLD Generation
    // Add IP_OLD at t=900 (late in the first window)
    vi.setSystemTime(900);
    limiter.check('IP_OLD');
    // State: currentGen has {IP_OLD}. lastCheck=900.

    // 3. Trigger Rotation & Fill Current Generation
    // Advance time to t=1010 (> windowMs from lastCleanup=0) to trigger rotation.
    vi.setSystemTime(1010);

    // Add IP_A (enters currentGen).
    limiter.check('IP_A');
    // State: oldGen={IP_OLD}. currentGen={IP_A}.

    // Add IP_B (enters currentGen).
    limiter.check('IP_B');
    // State: oldGen={IP_OLD}. currentGen={IP_A, IP_B}. (Full, Size=2).
    // IP_A is oldest in currentGen (inserted first).

    // 4. Act: Trigger Migration
    // Check IP_OLD at t=1020.
    vi.setSystemTime(1020);
    limiter.check('IP_OLD');

    // Logic Trace:
    // - IP_OLD not found in currentGen.
    // - Found in oldGen (lastCheck=900).
    // - elapsed = 1020 - 900 = 120.
    // - 120 <= 1000 (windowMs). Condition TRUE.
    // - Enters migration block.
    // - currentGen.size (2) >= maxIps (2). Condition TRUE.
    // - Evicts oldest in currentGen (IP_A).
    // - Adds IP_OLD to currentGen.

    // 5. Assert
    // IP_A should be evicted from currentGen.
    // We can verify this by checking IP_A's token count.
    // If it was evicted, it's treated as a new user (LIMIT - 1 tokens).
    // If it was kept, it would have fewer tokens (we consumed 1).

    // To make it distinct, let's consume more tokens for IP_A initially.

    // Revised Step 3:
    // t=1010
    // Consume 5 tokens for IP_A.
    // limiter.check('IP_A'); ... (5 times)

    // But wait, checking multiple times updates `lastCheck` and moves it to "newest" (LRU).
    // If I check IP_A 5 times, then check IP_B 1 time.
    // IP_B is newest. IP_A is oldest.
    // Eviction removes oldest -> IP_A.
    // So this still works.

    // Let's refine the check:
    expect(limiter.currentGen.has('IP_A')).toBe(false);
    expect(limiter.currentGen.has('IP_B')).toBe(true);
    expect(limiter.currentGen.has('IP_OLD')).toBe(true);
  });
});
