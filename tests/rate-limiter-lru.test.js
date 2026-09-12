import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/worker-utils.js';

describe('RateLimiter LRU Eviction', () => {
  let limiter;

  beforeEach(() => {
    // Mock system time to ensure deterministic token replenishment
    vi.useFakeTimers();
    vi.setSystemTime(1000000); // Start at a fixed timestamp
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evicts the oldest entry when maxIps limit is reached', () => {
    // 1. Arrange: Create a limiter with strict capacity
    // limit=2 tokens per window
    // window=1000ms
    // maxIps=2 (Small capacity to force eviction)
    const MAX_IPS = 2;
    limiter = new RateLimiter(2, 1000, MAX_IPS);

    // 2. Act: Fill the capacity with IP1 and IP2

    // IP1: Consume all tokens
    expect(limiter.check('1.1.1.1')).toBe(true); // Tokens: 1
    expect(limiter.check('1.1.1.1')).toBe(true); // Tokens: 0
    expect(limiter.check('1.1.1.1')).toBe(false); // Blocked

    // IP2: Consume all tokens
    expect(limiter.check('2.2.2.2')).toBe(true); // Tokens: 1
    expect(limiter.check('2.2.2.2')).toBe(true); // Tokens: 0
    expect(limiter.check('2.2.2.2')).toBe(false); // Blocked

    // Current state: Map is full [IP1, IP2] (IP1 is oldest)

    // 3. Act: Add IP3 to trigger eviction
    expect(limiter.check('3.3.3.3')).toBe(true); // Tokens: 1

    // Current state: Map is [IP2, IP3]. IP1 should be evicted.

    // 4. Assert: Verify IP1 is treated as a NEW user
    // If IP1 was still in memory, it would have 0 tokens and be blocked.
    // If IP1 was evicted, it is re-initialized with (limit - 1) tokens.
    expect(limiter.check('1.1.1.1')).toBe(true);
  });

  it('moves a re-checked IP to the MRU position so it survives eviction', () => {
    // Map.set() on an existing key updates the value in place without moving
    // the key in iteration order, so check() must delete before it sets for
    // eviction to pick the genuinely least-recently-used entry. This pins that
    // ordering: without the delete, IP1 would stay oldest and be evicted here.
    const MAX_IPS = 2;
    limiter = new RateLimiter(1, 1000, MAX_IPS);

    limiter.check('1.1.1.1'); // order: [IP1]
    limiter.check('2.2.2.2'); // order: [IP1, IP2] — IP1 oldest
    limiter.check('1.1.1.1'); // order: [IP2, IP1] — IP2 now oldest
    limiter.check('3.3.3.3'); // evicts IP2, not IP1

    expect(limiter.activeStore.has('1.1.1.1')).toBe(true);
    expect(limiter.activeStore.has('2.2.2.2')).toBe(false);
    expect(limiter.activeStore.has('3.3.3.3')).toBe(true);
  });

  it('keeps LRU order correct for a record promoted from the previous window', () => {
    // A record promoted out of previousStore was never in activeStore, so
    // check() skips the delete for it. It must still land at the MRU end.
    const MAX_IPS = 2;
    limiter = new RateLimiter(2, 1000, MAX_IPS);

    limiter.check('1.1.1.1');

    // Cross the window boundary: activeStore rotates into previousStore.
    vi.setSystemTime(1000000 + 1001);

    limiter.check('2.2.2.2'); // fresh entry     -> order: [IP2]
    limiter.check('1.1.1.1'); // promoted record -> order: [IP2, IP1]
    limiter.check('3.3.3.3'); // evicts IP2, the oldest

    expect(limiter.activeStore.has('1.1.1.1')).toBe(true);
    expect(limiter.activeStore.has('2.2.2.2')).toBe(false);
    expect(limiter.activeStore.has('3.3.3.3')).toBe(true);
  });
});
