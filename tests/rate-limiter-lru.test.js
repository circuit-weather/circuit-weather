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

  it('refreshes access order when an existing entry is checked', () => {
    // Capacity = 2
    limiter = new RateLimiter(1, 1000, 2);

    // Fill with IP1 and IP2
    limiter.check('1.1.1.1'); // Map: [IP1]
    limiter.check('2.2.2.2'); // Map: [IP1, IP2] (IP1 is oldest)

    // Access IP1 again to refresh its access order
    limiter.check('1.1.1.1'); // Map: [IP2, IP1] (IP2 is now oldest)

    // Add IP3 to trigger LRU eviction
    limiter.check('3.3.3.3'); // Map: [IP1, IP3] (IP2 should be evicted)

    // Assert IP2 was evicted (re-added as new with full limit - 1 tokens)
    // while IP1 was retained in store
    expect(limiter.activeStore.has('1.1.1.1')).toBe(true);
    expect(limiter.activeStore.has('2.2.2.2')).toBe(false);
    expect(limiter.activeStore.has('3.3.3.3')).toBe(true);
  });
});
